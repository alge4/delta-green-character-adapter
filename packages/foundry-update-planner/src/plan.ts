import {
  createOperationResult,
  createSafeValueSummary,
  sortDiagnostics,
  type AdapterDiagnostic,
  type AdapterOperationResult,
  type ResolutionRequirement,
} from "@delta-green-character-adapter/adapter-core";
import {
  ADAPTER_FLAG_NAMESPACE,
  EXPORT_ADAPTER_ID,
  EXPORT_CAPABILITY_ID,
  exportFoundryDeltaGreen,
  foundrySemanticView,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import {
  createCanonicalId,
  safeParseAgentSnapshot,
} from "@delta-green-character-adapter/character-model";

import { mutableIsFresh, resolveBinding } from "./binding.js";
import { isBlankUntouchedTarget, targetActorFingerprint } from "./blank-fingerprint.js";
import { planCollections } from "./collections.js";
import { planDerivedMaximaConflicts } from "./derived-maxima.js";
import {
  catalogueDiagnosticCodes,
  diagnostic,
  plannerDiagnosticCodes,
} from "./diagnostics.js";
import { publishEntries, pushEntry, type DraftPlanEntry } from "./entries.js";
import { planActorScalars } from "./scalars.js";
import { parseUpdatePlan, type UpdateMode, type UpdatePlan } from "./schemas.js";
import { applySelectionOverrides, buildScopes, planDigest } from "./selection.js";
import { deepEqual, isRecord, pointer } from "./util.js";

export type PlanFoundryActorUpdateOptions = {
  readonly mode?: UpdateMode;
  readonly createId?: () => string;
  readonly actorId?: string;
  readonly callerIsGm?: boolean;
  readonly now?: string;
  readonly selectionOverrides?: Readonly<Record<string, boolean>>;
  readonly recognizeBlankFingerprint?: boolean;
  readonly adapterVersion?: string;
};

/**
 * Pure Actor Binding + immutable Merge/Replace/Synchronize Update Plan (#7, #10, #26).
 */
export function planFoundryActorUpdate(
  snapshot: unknown,
  actorSource: unknown,
  options: PlanFoundryActorUpdateOptions = {},
): AdapterOperationResult {
  const createId = options.createId ?? createCanonicalId;
  const mode: UpdateMode = options.mode ?? "merge";
  const callerIsGm = options.callerIsGm === true;
  const recognizeBlank = options.recognizeBlankFingerprint !== false;
  const diagnostics: AdapterDiagnostic[] = [];
  const requiredResolutions: ResolutionRequirement[] = [];

  const parsed = safeParseAgentSnapshot(snapshot);
  if (!parsed.success) {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: catalogueDiagnosticCodes.malformedStructure,
          severity: "fatal",
          message: `Input does not parse as canonical Agent 1.0.0: ${parsed.error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
            .join("; ")}`,
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }
  const agent = parsed.data;

  if (!isRecord(actorSource) || actorSource.type !== "agent") {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: catalogueDiagnosticCodes.malformedStructure,
          severity: "fatal",
          message: "Target Actor source must be a serializable Delta Green agent Actor.",
          targetPath: "/type",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  const exportResult = exportFoundryDeltaGreen(agent, {
    createId,
    ...(options.adapterVersion !== undefined ? { adapterVersion: options.adapterVersion } : {}),
  });
  diagnostics.push(...exportResult.diagnostics);
  if (exportResult.blocked || exportResult.output === undefined) {
    return createOperationResult({
      diagnostics: sortDiagnostics(diagnostics),
      requiredResolutions: [...exportResult.requiredResolutions],
    });
  }
  const desiredActor = exportResult.output;

  const binding = resolveBinding(
    agent,
    actorSource,
    options.actorId,
    diagnostics,
    requiredResolutions,
  );
  const bound = binding.state === "bound";
  const blankTarget = recognizeBlank && isBlankUntouchedTarget(actorSource);
  const mutableFresh = mutableIsFresh(agent, actorSource, options.now);
  if (mode === "synchronize" && !mutableFresh) {
    diagnostics.push(
      diagnostic({
        code: catalogueDiagnosticCodes.staleState,
        severity: "warning",
        message:
          "Synchronize mutable changes are deselected because imported provenance is missing, unreliable, or not newer than the last successful update.",
        canonicalPath: "/provenance/capturedAt",
        targetPath: pointer("flags", ADAPTER_FLAG_NAMESPACE, "audit", "timestamp"),
      }),
    );
  }

  const scopes = buildScopes(exportResult.diagnostics);
  const entries: DraftPlanEntry[] = [];

  let bindEntryId: string | undefined;
  if (binding.state === "proposed" || binding.state === "unbound" || binding.state === "conflict") {
    bindEntryId = createId();
    pushEntry(entries, {
      id: bindEntryId,
      operation: "bind",
      path: pointer("flags", ADAPTER_FLAG_NAMESPACE, "agentId"),
      fieldClass: "adapterOwned",
      beforeValue: binding.targetAgentId,
      proposedValue: agent.agentId,
      mode,
      blankTarget,
      mutableFresh,
      bound: false,
      removalEligible: false,
      callerIsGm,
      scope: "biography",
      selectedOverride: false,
      selectionReasonOverride:
        binding.state === "proposed"
          ? "Name match proposes Actor Binding; confirmation is required."
          : "Actor Binding must be established before updates apply.",
    });
  }

  if (mode === "replace" || mode === "synchronize") {
    diagnostics.push(
      diagnostic({
        code: plannerDiagnosticCodes.recoveryRequired,
        severity: "information",
        message:
          "Replace/Synchronize require a verified restorable snapshot before apply (#27); the planner only records eligibility.",
        targetPath: "/_id",
        completenessImpact: "none",
        acknowledgement: { kind: "none" },
        remediations: [],
      }),
    );
  }

  if (binding.state === "bound" || binding.state === "proposed") {
    const planCtx = {
      createId,
      mode,
      blankTarget,
      mutableFresh,
      bound,
      callerIsGm,
      ...(bindEntryId !== undefined ? { bindEntryId } : {}),
    };
    planActorScalars(entries, agent, actorSource, desiredActor, planCtx, diagnostics);
    planDerivedMaximaConflicts(entries, actorSource, desiredActor, planCtx, diagnostics);
    planCollections(
      entries,
      agent,
      desiredActor,
      actorSource,
      {
        ...planCtx,
        scopes,
      },
      diagnostics,
      requiredResolutions,
    );
  }

  const overridden = applySelectionOverrides(entries, options.selectionOverrides, diagnostics);
  const writeEntries = overridden.filter(
    (entry) =>
      entry.operation !== "preserve" &&
      !(entry.operation === "update" && deepEqual(entry.beforeValue, entry.proposedValue)),
  );

  const semanticBefore = foundrySemanticView(actorSource);
  const semanticDesired = foundrySemanticView(desiredActor);
  const alreadyUpToDate =
    bound &&
    deepEqual(semanticBefore, semanticDesired) &&
    writeEntries.every((entry) => entry.selectedByDefault === false || entry.operation === "bind");

  const selectedWrites = overridden.filter(
    (entry) =>
      entry.selectedByDefault &&
      entry.operation !== "preserve" &&
      entry.operation !== "bind",
  );
  const isNoOp = bound && selectedWrites.length === 0 && deepEqual(semanticBefore, semanticDesired);

  if (isNoOp || alreadyUpToDate) {
    diagnostics.push(
      diagnostic({
        code: plannerDiagnosticCodes.alreadyUpToDate,
        severity: "information",
        message:
          "Reapplying an unchanged canonical snapshot to an unchanged bound Actor is a no-op.",
        targetPath: "/_id",
        canonicalPath: "/agentId",
        completenessImpact: "none",
        acknowledgement: { kind: "none" },
        remediations: [],
      }),
    );
  }

  if ((mode === "replace" || mode === "synchronize") && !callerIsGm) {
    const handlerEntries = overridden.filter((entry) => entry.fieldClass === "handlerOnly");
    for (const entry of handlerEntries) {
      if (entry.operation === "remove" || entry.operation === "clear" || entry.operation === "update") {
        entry.selectedByDefault = false;
        entry.proposed = createSafeValueSummary(entry.proposedValue, "handlerOnly");
        entry.before = createSafeValueSummary(entry.beforeValue, "handlerOnly");
      }
    }
  }

  const digest = planDigest(overridden, mode);
  const targetFingerprint = targetActorFingerprint(actorSource);
  const planId = createId();

  const plan = parseUpdatePlan({
    planId,
    mode,
    capabilityId: EXPORT_CAPABILITY_ID,
    agentId: agent.agentId,
    binding,
    targetFingerprint,
    sourceContentHash: agent.provenance.contentHash,
    planDigest: digest,
    blankTarget,
    alreadyUpToDate: isNoOp || alreadyUpToDate,
    scopes,
    permissions: {
      requiresActorUpdate: true,
      requiresGmForHandlerContent: overridden.some((entry) => entry.fieldClass === "handlerOnly"),
      requiresRecoverySnapshot: mode === "replace" || mode === "synchronize",
      ...(options.callerIsGm !== undefined ? { callerIsGm: options.callerIsGm } : {}),
    },
    entries: publishEntries(overridden),
    auditPreview: {
      capabilityId: EXPORT_CAPABILITY_ID,
      adapterIds: [EXPORT_ADAPTER_ID],
      sourceContentHash: agent.provenance.contentHash,
      planDigest: digest,
      targetFingerprint,
      mode,
    },
  } satisfies UpdatePlan);

  return createOperationResult({
    diagnostics: sortDiagnostics(diagnostics),
    requiredResolutions,
    plan,
  });
}
