import {
  createOperationResult,
  sortDiagnostics,
  type AdapterDiagnostic,
  type AdapterOperationResult,
} from "@delta-green-character-adapter/adapter-core";
import {
  ADAPTER_FLAG_NAMESPACE,
  foundrySemanticView,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import {
  materializeSelectedPlanActions,
  parseUpdatePlan,
  targetActorFingerprint,
  type UpdatePlan,
} from "@delta-green-character-adapter/foundry-update-planner";

import {
  auditSummaryForOutput,
  buildCompactAudit,
  writeCompactAuditFlags,
} from "./audit.js";
import { applyBatchesToSourceClone, executeApplyBatches, prepareApplyBatches } from "./batch.js";
import {
  MANUAL_RECOVERY_DISCLOSURE,
  applyDiagnosticCodes,
  diagnostic,
} from "./diagnostics.js";
import { isRecord } from "./paths.js";
import { captureVerifiedRecoverySnapshot, restoreAndVerify } from "./recovery.js";
import type { FoundryActorRuntime } from "./runtime.js";
import { verifyAppliedActorState } from "./verify.js";

function readAdapterBindings(source: unknown): unknown {
  if (!isRecord(source) || !isRecord(source.flags)) {
    return undefined;
  }
  const adapter = source.flags[ADAPTER_FLAG_NAMESPACE];
  if (!isRecord(adapter)) {
    return undefined;
  }
  return adapter.bindings;
}

export type ApplyFoundryActorUpdateInput = {
  readonly plan: unknown;
  readonly snapshot: unknown;
  readonly runtime: FoundryActorRuntime;
  readonly options?: {
    readonly now?: string;
    readonly adapterVersion?: string;
    readonly createId?: () => string;
    /** Offered on incomplete rollback — NEVER stored in flags. */
    readonly onManualRecovery?: (snapshot: unknown, disclosure: string) => void;
  };
};

function planHasSelectedHandlerWork(plan: UpdatePlan): boolean {
  return plan.entries.some(
    (entry) => entry.selectedByDefault && entry.fieldClass === "handlerOnly",
  );
}

async function failWithRollback(input: {
  readonly runtime: FoundryActorRuntime;
  readonly recoverySnapshot: unknown | undefined;
  readonly preApplySource: unknown;
  readonly diagnostics: AdapterDiagnostic[];
  readonly failure: AdapterDiagnostic;
  readonly onManualRecovery?: ((snapshot: unknown, disclosure: string) => void) | undefined;
}): Promise<AdapterOperationResult> {
  const diagnostics = [...input.diagnostics, input.failure];

  if (input.recoverySnapshot === undefined) {
    return createOperationResult({
      diagnostics: sortDiagnostics(diagnostics),
      requiredResolutions: [],
    });
  }

  const restored = await restoreAndVerify(
    input.runtime,
    input.recoverySnapshot,
    input.preApplySource,
  );

  if (!restored.ok) {
    diagnostics.push(
      diagnostic({
        code: applyDiagnosticCodes.applyFailure,
        severity: "fatal",
        phase: "apply",
        message: `Apply failed and rollback was incomplete: ${restored.reason}`,
        targetPath: "/_id",
        acknowledgement: { kind: "none" },
        remediations: [{ action: "abort", label: "Abort operation" }],
        technical: restored.reason,
      }),
    );
    input.onManualRecovery?.(input.recoverySnapshot, MANUAL_RECOVERY_DISCLOSURE);
    return createOperationResult({
      diagnostics: sortDiagnostics(diagnostics),
      requiredResolutions: [],
      output: {
        kind: "manual-recovery",
        disclosure: MANUAL_RECOVERY_DISCLOSURE,
        // Exposed for authorized download only — never written to module flags.
        recoverySnapshot: input.recoverySnapshot,
      },
    });
  }

  return createOperationResult({
    diagnostics: sortDiagnostics(diagnostics),
    requiredResolutions: [],
  });
}

/**
 * Apply a validated Update Plan through an injectable Foundry Actor runtime (#27).
 */
export async function applyFoundryActorUpdate(
  input: ApplyFoundryActorUpdateInput,
): Promise<AdapterOperationResult> {
  const diagnostics: AdapterDiagnostic[] = [];
  const adapterVersion = input.options?.adapterVersion ?? "0.0.0";
  const now = input.options?.now ?? new Date().toISOString();

  let plan: UpdatePlan;
  try {
    plan = parseUpdatePlan(input.plan);
  } catch (error) {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: applyDiagnosticCodes.malformedStructure,
          severity: "fatal",
          message: `Update Plan failed validation: ${error instanceof Error ? error.message : String(error)}`,
          targetPath: "/_id",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  if (!input.runtime.canUpdateActor()) {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: applyDiagnosticCodes.permissionDenied,
          severity: "fatal",
          message: "Caller lacks permission to update this Actor; no writes were attempted.",
          targetPath: "/_id",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  if (planHasSelectedHandlerWork(plan) && !input.runtime.isGm()) {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: applyDiagnosticCodes.permissionDenied,
          severity: "fatal",
          message: "Selected Handler-only work requires a GM; no privilege elevation is performed.",
          targetPath: "/_id",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  const preApplySource = input.runtime.readActorSource();
  const targetFingerprint = targetActorFingerprint(preApplySource);

  const materialized = materializeSelectedPlanActions(
    input.snapshot,
    preApplySource,
    plan,
    {
      ...(input.options?.createId !== undefined ? { createId: input.options.createId } : {}),
      ...(input.options?.adapterVersion !== undefined
        ? { adapterVersion: input.options.adapterVersion }
        : {}),
      ...(input.options?.now !== undefined ? { now: input.options.now } : {}),
      actorId: input.runtime.actorId,
      callerIsGm: input.runtime.isGm(),
    },
  );
  diagnostics.push(...materialized.diagnostics);

  if (materialized.blocked || materialized.actions === undefined) {
    return createOperationResult({
      diagnostics: sortDiagnostics(diagnostics),
      requiredResolutions: [...materialized.requiredResolutions],
    });
  }

  const actions = materialized.actions;
  if (actions.length === 0 || plan.alreadyUpToDate) {
    return createOperationResult({
      diagnostics: sortDiagnostics(diagnostics),
      requiredResolutions: [],
      plan,
      output: {
        kind: "noop",
        reason: "already-up-to-date",
        actorId: input.runtime.actorId,
        targetFingerprint,
      },
    });
  }

  // Issue #7/#10: always capture a verified in-memory recovery snapshot before mutation.
  const recovery = captureVerifiedRecoverySnapshot(input.runtime);
  if (!recovery.ok) {
    return createOperationResult({
      diagnostics: sortDiagnostics([
        ...diagnostics,
        diagnostic({
          code: applyDiagnosticCodes.applyFailure,
          severity: "fatal",
          message: `Blocked before mutation: ${recovery.reason}`,
          targetPath: "/_id",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ]),
      requiredResolutions: [],
    });
  }

  const batches = prepareApplyBatches(actions);
  const expectedSource = applyBatchesToSourceClone(preApplySource, batches, input.options?.createId);
  const expectedSemantic = foundrySemanticView(expectedSource);
  const nonDestructiveActions = actions.filter(
    (action) => action.operation !== "remove" && action.operation !== "clear",
  );

  try {
    await executeApplyBatches(input.runtime, batches, {
      beforeDestructive: () => {
        const midSource = input.runtime.readActorSource();
        const midExpected = applyBatchesToSourceClone(
          preApplySource,
          {
            ...batches,
            clearDiff: {},
            itemClears: [],
            removals: [],
          },
          input.options?.createId,
        );
        const mid = verifyAppliedActorState({
          preApplySource,
          postApplySource: midSource,
          plan,
          actions: nonDestructiveActions,
          expectedSemantic: foundrySemanticView(midExpected),
        });
        if (!mid.ok) {
          throw new Error(`Pre-deletion verification failed: ${mid.reason}`);
        }
      },
    });
  } catch (error) {
    return failWithRollback({
      runtime: input.runtime,
      recoverySnapshot: recovery.snapshot,
      preApplySource,
      diagnostics,
      ...(input.options?.onManualRecovery !== undefined
        ? { onManualRecovery: input.options.onManualRecovery }
        : {}),
      failure: diagnostic({
        code: applyDiagnosticCodes.applyFailure,
        severity: "fatal",
        message: `Actor update failed during mutation: ${error instanceof Error ? error.message : String(error)}`,
        targetPath: "/_id",
        acknowledgement: { kind: "none" },
        remediations: [{ action: "abort", label: "Abort operation" }],
        technical: error instanceof Error ? error.message : String(error),
      }),
    });
  }

  const postApplySource = input.runtime.readActorSource();
  const verification = verifyAppliedActorState({
    preApplySource,
    postApplySource,
    plan,
    actions,
    expectedSemantic,
  });

  if (!verification.ok) {
    return failWithRollback({
      runtime: input.runtime,
      recoverySnapshot: recovery.snapshot,
      preApplySource,
      diagnostics,
      ...(input.options?.onManualRecovery !== undefined
        ? { onManualRecovery: input.options.onManualRecovery }
        : {}),
      failure: diagnostic({
        code: applyDiagnosticCodes.verificationMismatch,
        severity: "fatal",
        phase: "verify",
        message: verification.reason,
        targetPath: "/_id",
        acknowledgement: { kind: "none" },
        remediations: [{ action: "abort", label: "Abort operation" }],
      }),
    });
  }

  const resultFingerprint = targetActorFingerprint(postApplySource);
  const bindings = readAdapterBindings(postApplySource);
  const audit = buildCompactAudit({
    plan,
    actions,
    adapterVersion,
    targetFingerprint,
    resultFingerprint,
    userId: input.runtime.currentUserId(),
    timestamp: now,
    ...(bindings !== undefined ? { bindings } : {}),
  });

  try {
    await writeCompactAuditFlags(input.runtime, audit, bindings);
  } catch (error) {
    return failWithRollback({
      runtime: input.runtime,
      recoverySnapshot: recovery.snapshot,
      preApplySource,
      diagnostics,
      ...(input.options?.onManualRecovery !== undefined
        ? { onManualRecovery: input.options.onManualRecovery }
        : {}),
      failure: diagnostic({
        code: applyDiagnosticCodes.applyFailure,
        severity: "fatal",
        message: `Audit flag write failed: ${error instanceof Error ? error.message : String(error)}`,
        targetPath: `/flags/deltaGreenCharacterAdapter/audit`,
        acknowledgement: { kind: "none" },
        remediations: [{ action: "abort", label: "Abort operation" }],
      }),
    });
  }

  const finalSource = input.runtime.readActorSource();
  const finalFingerprint = targetActorFingerprint(finalSource);
  const finalBindings = readAdapterBindings(finalSource);
  const finalAudit = buildCompactAudit({
    plan,
    actions,
    adapterVersion,
    targetFingerprint,
    resultFingerprint: finalFingerprint,
    userId: input.runtime.currentUserId(),
    timestamp: now,
    ...(finalBindings !== undefined ? { bindings: finalBindings } : {}),
  });

  return createOperationResult({
    diagnostics: sortDiagnostics(diagnostics),
    requiredResolutions: [],
    plan,
    output: {
      kind: "applied",
      actorId: input.runtime.actorId,
      audit: auditSummaryForOutput(finalAudit),
    },
  });
}
