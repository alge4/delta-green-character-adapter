import {
  fingerprintDiagnostic,
  type AdapterDiagnostic,
  type AdapterOperationResult,
  type RemediationActionKind,
} from "@delta-green-character-adapter/adapter-core";
import {
  importGreenAgentCreator,
  SOURCE_VERSION,
} from "@delta-green-character-adapter/adapter-green-agent-creator";
import type { AgentSnapshot } from "@delta-green-character-adapter/character-model";
import {
  parseUpdatePlan,
  planFoundryActorUpdate,
  targetActorFingerprint,
  type UpdatePlan,
} from "@delta-green-character-adapter/foundry-update-planner";
import { assessAgentSnapshot } from "@delta-green-character-adapter/validation";

import { applyFoundryActorUpdate } from "../apply.js";
import { applyDiagnosticCodes, diagnostic as applyDiagnostic } from "../diagnostics.js";
import type { FoundryActorRuntime } from "../runtime.js";
import { readModuleOwnedBio, type ModuleOwnedBioFields } from "./module-owned.js";
import {
  isSupportedAgentSheet,
  type AgentSheetContext,
} from "./sheet-eligibility.js";

export type ImportWizardPhase =
  | "closed"
  | "source"
  | "diagnostics"
  | "plan"
  | "applying"
  | "done"
  | "failed"
  | "recovery";

export type ImportWizardDiagnostic = AdapterDiagnostic & {
  readonly fingerprint: string;
};

export type ImportWizardView = {
  readonly phase: ImportWizardPhase;
  readonly open: boolean;
  readonly sheetEligible: boolean;
  readonly completeness: "green" | "amber" | "red" | null;
  readonly sourceLabel: string | null;
  readonly blocked: boolean;
  readonly diagnostics: readonly ImportWizardDiagnostic[];
  readonly pendingGroupAcknowledgements: readonly string[];
  readonly pendingTargetedResolutions: readonly string[];
  readonly canContinueToPlan: boolean;
  readonly canApply: boolean;
  readonly plan: UpdatePlan | null;
  readonly selection: Readonly<Record<string, boolean>>;
  readonly staleReplanRequired: boolean;
  readonly applyResult: AdapterOperationResult | null;
  readonly recoverySnapshot: unknown | null;
  readonly recoveryDisclosure: string | null;
  readonly moduleOwnedBio: ModuleOwnedBioFields;
  readonly handlerOnlyVisible: boolean;
  readonly progressMessage: string | null;
};

export type ImportWizardSession = {
  view(): ImportWizardView;
  subscribe(listener: () => void): () => void;
  open(): void;
  close(): void;
  cancel(): void;
  loadLocalGreenSource(input: { readonly bytes: string | Uint8Array; readonly fileName: string }): void;
  selectRemediation(
    diagnosticFingerprint: string,
    action: RemediationActionKind,
    parameters?: Readonly<Record<string, unknown>>,
  ): void;
  acknowledgeGroup(groupKey: string): void;
  continueToPlan(): void;
  backToDiagnostics(): void;
  setEntrySelected(entryId: string, selected: boolean): void;
  /** Clears the stale-replan gate after the user reviews the replanned Update Plan. */
  acceptReplan(): void;
  confirmApply(): Promise<void>;
  dismissRecovery(): void;
};

export type CreateImportWizardSessionInput = {
  readonly runtime: FoundryActorRuntime;
  readonly sheet: AgentSheetContext;
  readonly options?: {
    readonly mode?: "merge";
    readonly adapterVersion?: string;
    readonly createId?: () => string;
    readonly now?: string;
    readonly onManualRecovery?: (snapshot: unknown, disclosure: string) => void;
    /** Title-bar Completeness Assessment before an import snapshot exists. */
    readonly sheetCompleteness?: "green" | "amber" | "red";
  };
};

type InternalState = {
  phase: ImportWizardPhase;
  sourceLabel: string | null;
  importResult: AdapterOperationResult | null;
  snapshot: AgentSnapshot | null;
  planResult: AdapterOperationResult | null;
  plan: UpdatePlan | null;
  selectionOverrides: Record<string, boolean>;
  acknowledgedGroups: Set<string>;
  targetedResolutions: Map<
    string,
    { action: RemediationActionKind; parameters?: Readonly<Record<string, unknown>> }
  >;
  staleReplanRequired: boolean;
  applyResult: AdapterOperationResult | null;
  recoverySnapshot: unknown | null;
  recoveryDisclosure: string | null;
  progressMessage: string | null;
};

function emptyState(): InternalState {
  return {
    phase: "closed",
    sourceLabel: null,
    importResult: null,
    snapshot: null,
    planResult: null,
    plan: null,
    selectionOverrides: {},
    acknowledgedGroups: new Set(),
    targetedResolutions: new Map(),
    staleReplanRequired: false,
    applyResult: null,
    recoverySnapshot: null,
    recoveryDisclosure: null,
    progressMessage: null,
  };
}

/** Resetting ids keep Update Plan entry identities stable across replans. */
function resettingIdFactory(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    // Canonical Agent Snapshot ids must be lowercase UUID v4.
    return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
  };
}

function groupKeysFrom(diagnostics: readonly AdapterDiagnostic[]): string[] {
  const keys = new Set<string>();
  for (const item of diagnostics) {
    if (item.acknowledgement.kind === "group") {
      keys.add(item.acknowledgement.groupKey);
    }
  }
  return [...keys].sort();
}

function pendingGroups(state: InternalState, diagnostics: readonly AdapterDiagnostic[]): string[] {
  return groupKeysFrom(diagnostics).filter((key) => !state.acknowledgedGroups.has(key));
}

function pendingTargeted(state: InternalState, result: AdapterOperationResult | null): string[] {
  if (result === null) {
    return [];
  }
  return result.requiredResolutions
    .map((requirement) => requirement.diagnosticFingerprint)
    .filter((fingerprint) => !state.targetedResolutions.has(fingerprint));
}

function asSnapshot(output: unknown): AgentSnapshot | null {
  if (output === null || typeof output !== "object") {
    return null;
  }
  return output as AgentSnapshot;
}

/**
 * Deep wizard controller for local Green → Update Plan → verified apply (#9/#28).
 * UI renders the view; Foundry hooks inject the runtime port.
 */
export function createImportWizardSession(
  input: CreateImportWizardSessionInput,
): ImportWizardSession {
  const createId = input.options?.createId ?? resettingIdFactory();
  const mode = input.options?.mode ?? "merge";
  const listeners = new Set<() => void>();
  let state = emptyState();

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const setState = (patch: Partial<InternalState>): void => {
    state = { ...state, ...patch };
    notify();
  };

  const resetClosed = (): void => {
    state = emptyState();
    notify();
  };

  const sheetEligible = isSupportedAgentSheet(input.sheet);

  const activeDiagnostics = (): AdapterDiagnostic[] => {
    const importDiags = state.importResult?.diagnostics ?? [];
    const planDiags = state.planResult?.diagnostics ?? [];
    // Always surface plan diagnostics once planning has been attempted so binding
    // / planner failures are visible on the diagnostics step (#40).
    if (state.phase === "source" || planDiags.length === 0) {
      return [...importDiags];
    }
    const merged = [...importDiags];
    const seen = new Set(importDiags.map((item) => fingerprintDiagnostic(item)));
    for (const item of planDiags) {
      const fingerprint = fingerprintDiagnostic(item);
      if (!seen.has(fingerprint)) {
        merged.push(item);
        seen.add(fingerprint);
      }
    }
    return merged;
  };

  const planWithCurrentSelection = (): void => {
    if (state.snapshot === null) {
      return;
    }
    const actorSource = input.runtime.readActorSource();
    const planResult = planFoundryActorUpdate(state.snapshot, actorSource, {
      mode,
      callerIsGm: input.runtime.isGm(),
      createId: resettingIdFactory(),
      actorId: input.runtime.actorId,
      ...(input.options?.now !== undefined ? { now: input.options.now } : {}),
      ...(input.options?.adapterVersion !== undefined
        ? { adapterVersion: input.options.adapterVersion }
        : {}),
      selectionOverrides: state.selectionOverrides,
    });
    if (planResult.plan === undefined) {
      setState({
        planResult,
        plan: null,
        phase: "diagnostics",
        staleReplanRequired: false,
        progressMessage: null,
      });
      return;
    }
    setState({
      planResult,
      plan: parseUpdatePlan(planResult.plan),
      phase: "plan",
      staleReplanRequired: false,
      progressMessage: null,
    });
  };

  const view = (): ImportWizardView => {
    const diagnostics = activeDiagnostics().map((item) => ({
      ...item,
      fingerprint: fingerprintDiagnostic(item),
    }));
    const importBlocked = state.importResult?.blocked === true;
    const planBlocked = state.planResult?.blocked === true;
    const pendingGroupAcknowledgements = pendingGroups(state, state.importResult?.diagnostics ?? []);
    const pendingTargetedResolutions = pendingTargeted(state, state.importResult);
    const completeness =
      state.snapshot !== null
        ? assessAgentSnapshot(state.snapshot).completeness
        : (state.importResult?.completeness ?? input.options?.sheetCompleteness ?? null);

    const canContinueToPlan =
      state.phase === "diagnostics" &&
      !importBlocked &&
      state.snapshot !== null &&
      pendingGroupAcknowledgements.length === 0 &&
      pendingTargetedResolutions.length === 0;

    const selection: Record<string, boolean> = {};
    if (state.plan !== null) {
      for (const entry of state.plan.entries) {
        selection[entry.id] =
          state.selectionOverrides[entry.id] !== undefined
            ? state.selectionOverrides[entry.id]!
            : entry.selectedByDefault;
      }
    }

    const canApply =
      state.phase === "plan" &&
      state.plan !== null &&
      !planBlocked &&
      !state.staleReplanRequired &&
      Object.values(selection).some((selected) => selected === true);

    return {
      phase: state.phase,
      open: state.phase !== "closed",
      sheetEligible,
      completeness,
      sourceLabel: state.sourceLabel,
      blocked: importBlocked || planBlocked || state.phase === "failed",
      diagnostics,
      pendingGroupAcknowledgements,
      pendingTargetedResolutions,
      canContinueToPlan,
      canApply,
      plan: state.plan,
      selection,
      staleReplanRequired: state.staleReplanRequired,
      applyResult: state.applyResult,
      recoverySnapshot: state.recoverySnapshot,
      recoveryDisclosure: state.recoveryDisclosure,
      moduleOwnedBio: readModuleOwnedBio(input.runtime.readActorSource()),
      handlerOnlyVisible: input.runtime.isGm(),
      progressMessage: state.progressMessage,
    };
  };

  return {
    view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    open() {
      if (!sheetEligible) {
        throw new Error("Import controls target supported Agent sheets only.");
      }
      state = emptyState();
      setState({ phase: "source" });
    },
    close() {
      resetClosed();
    },
    cancel() {
      resetClosed();
    },
    loadLocalGreenSource({ bytes, fileName }) {
      if (state.phase !== "source" && state.phase !== "diagnostics" && state.phase !== "plan") {
        throw new Error("Cannot load a source outside the import wizard.");
      }

      // Exact capability claim: Green Agent Creator 5c9e92d only (#24/#28). Local parse; no upload.
      const importResult = importGreenAgentCreator(bytes, {
        createId,
        ...(input.options?.adapterVersion !== undefined
          ? { adapterVersion: input.options.adapterVersion }
          : {}),
        ...(input.options?.now !== undefined ? { capturedAt: input.options.now } : {}),
      });
      const snapshot = importResult.blocked ? null : asSnapshot(importResult.output);

      setState({
        phase: "diagnostics",
        sourceLabel: `${fileName} (Green Agent Creator ${SOURCE_VERSION})`,
        importResult,
        snapshot,
        planResult: null,
        plan: null,
        selectionOverrides: {},
        acknowledgedGroups: new Set(),
        targetedResolutions: new Map(),
        staleReplanRequired: false,
        applyResult: null,
        recoverySnapshot: null,
        recoveryDisclosure: null,
        progressMessage: null,
      });
    },
    selectRemediation(diagnosticFingerprint, action, parameters) {
      const next = new Map(state.targetedResolutions);
      next.set(diagnosticFingerprint, {
        action,
        ...(parameters !== undefined ? { parameters } : {}),
      });
      setState({ targetedResolutions: next });

      // Binding accept selects the Actor Binding entry so dependents can apply (#7/#28).
      if (action === "accept" && state.plan !== null) {
        const bindEntry = state.plan.entries.find((entry) => entry.operation === "bind");
        if (bindEntry !== undefined) {
          setState({
            selectionOverrides: { ...state.selectionOverrides, [bindEntry.id]: true },
          });
          planWithCurrentSelection();
        }
      }
    },
    acknowledgeGroup(groupKey) {
      const next = new Set(state.acknowledgedGroups);
      next.add(groupKey);
      setState({ acknowledgedGroups: next });
    },
    continueToPlan() {
      const current = view();
      if (!current.canContinueToPlan) {
        throw new Error("Diagnostics and acknowledgements must be resolved before planning.");
      }
      if (state.snapshot === null) {
        throw new Error("No imported Agent Snapshot is available to plan.");
      }
      // Single setState so the subscribed render sees phase "plan" (not a stale
      // diagnostics paint from an intermediate selectionOverrides notify) (#40).
      const actorSource = input.runtime.readActorSource();
      let planResult: ReturnType<typeof planFoundryActorUpdate>;
      try {
        planResult = planFoundryActorUpdate(state.snapshot, actorSource, {
          mode,
          callerIsGm: input.runtime.isGm(),
          createId: resettingIdFactory(),
          actorId: input.runtime.actorId,
          ...(input.options?.now !== undefined ? { now: input.options.now } : {}),
          ...(input.options?.adapterVersion !== undefined
            ? { adapterVersion: input.options.adapterVersion }
            : {}),
          selectionOverrides: {},
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState({
          selectionOverrides: {},
          plan: null,
          planResult: null,
          phase: "diagnostics",
          progressMessage: `Update Plan failed: ${message}`,
          staleReplanRequired: false,
        });
        throw error instanceof Error ? error : new Error(message);
      }
      if (planResult.plan === undefined) {
        setState({
          selectionOverrides: {},
          planResult,
          plan: null,
          phase: "diagnostics",
          staleReplanRequired: false,
          progressMessage: "Could not build an Update Plan. Resolve the diagnostics below.",
        });
        return;
      }
      setState({
        selectionOverrides: {},
        planResult,
        plan: parseUpdatePlan(planResult.plan),
        phase: "plan",
        staleReplanRequired: false,
        progressMessage: null,
      });
    },
    backToDiagnostics() {
      setState({
        phase: "diagnostics",
        plan: null,
        planResult: null,
        staleReplanRequired: false,
        progressMessage: null,
      });
    },
    setEntrySelected(entryId, selected) {
      if (state.plan === null) {
        throw new Error("No Update Plan is available.");
      }
      if (!state.plan.entries.some((item) => item.id === entryId)) {
        throw new Error(`Unknown Update Plan entry ${entryId}.`);
      }
      setState({
        selectionOverrides: { ...state.selectionOverrides, [entryId]: selected },
        staleReplanRequired: false,
      });
      planWithCurrentSelection();
    },
    acceptReplan() {
      if (state.phase !== "plan" || !state.staleReplanRequired) {
        throw new Error("No stale Update Plan is awaiting review.");
      }
      setState({
        staleReplanRequired: false,
        progressMessage: "Replanned Update Plan accepted — apply when ready.",
      });
    },
    async confirmApply() {
      const current = view();
      if (!current.canApply || state.plan === null || state.snapshot === null) {
        throw new Error("Update Plan is not ready to apply.");
      }

      const liveFingerprint = targetActorFingerprint(input.runtime.readActorSource());
      if (liveFingerprint !== state.plan.targetFingerprint) {
        const stale = applyDiagnostic({
          code: applyDiagnosticCodes.staleState,
          severity: "error",
          message: "Actor state changed after planning; replan before apply.",
          targetPath: "/_id",
          completenessImpact: "required",
          acknowledgement: { kind: "targeted" },
          remediations: [{ action: "accept", label: "Review replanned Update Plan" }],
        });
        planWithCurrentSelection();
        setState({
          staleReplanRequired: true,
          planResult: {
            blocked: false,
            completeness: "red",
            diagnostics: [...(state.planResult?.diagnostics ?? []), stale],
            requiredResolutions: [...(state.planResult?.requiredResolutions ?? [])],
          },
          progressMessage: "Stale Actor state detected — review the replanned Update Plan.",
        });
        return;
      }

      setState({ phase: "applying", progressMessage: "Applying Update Plan…" });

      let recoverySnapshot: unknown | null = null;
      let recoveryDisclosure: string | null = null;

      const applyResult = await applyFoundryActorUpdate({
        plan: state.plan,
        snapshot: state.snapshot,
        runtime: input.runtime,
        options: {
          createId,
          ...(input.options?.adapterVersion !== undefined
            ? { adapterVersion: input.options.adapterVersion }
            : {}),
          ...(input.options?.now !== undefined ? { now: input.options.now } : {}),
          onManualRecovery: (snapshot, disclosure) => {
            recoverySnapshot = snapshot;
            recoveryDisclosure = disclosure;
            input.options?.onManualRecovery?.(snapshot, disclosure);
          },
        },
      });

      if (applyResult.blocked) {
        const hasRecovery = recoverySnapshot !== null;
        setState({
          phase: hasRecovery ? "recovery" : "failed",
          applyResult,
          recoverySnapshot,
          recoveryDisclosure,
          progressMessage: hasRecovery
            ? "Apply failed; authorized manual recovery is available."
            : "Apply failed.",
        });
        return;
      }

      setState({
        phase: "done",
        applyResult,
        recoverySnapshot: null,
        recoveryDisclosure: null,
        progressMessage: "Verified persistence complete.",
      });
    },
    dismissRecovery() {
      setState({
        phase: "failed",
        recoverySnapshot: null,
        recoveryDisclosure: null,
      });
    },
  };
}
