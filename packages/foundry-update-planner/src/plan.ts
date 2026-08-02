import {
  createOperationResult,
  createSafeValueSummary,
  fingerprintDiagnostic,
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
  type AgentSnapshot,
} from "@delta-green-character-adapter/character-model";

import { isBlankUntouchedTarget, targetActorFingerprint } from "./blank-fingerprint.js";
import { desiredItemsFromSnapshotAndExport } from "./desired-items.js";
import {
  catalogueDiagnosticCodes,
  diagnostic,
  plannerDiagnosticCodes,
} from "./diagnostics.js";
import { classifyPath, defaultSelected, scopeForItemType } from "./field-classes.js";
import { matchCollections, readTargetItems } from "./matching.js";
import {
  parseUpdatePlan,
  summarizeValue,
  updateScopes,
  type PlanOperation,
  type UpdateFieldClass,
  type UpdateMode,
  type UpdatePlan,
  type UpdatePlanEntry,
  type UpdateScope,
} from "./schemas.js";
import {
  contentHash,
  deepEqual,
  isRecord,
  normalizeName,
  pointer,
  type UnknownRecord,
} from "./util.js";

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

type MutableEntry = {
  id: string;
  operation: PlanOperation;
  path: string;
  collection?: string;
  entity?: { id: string; collection?: string };
  fieldClass: UpdateFieldClass;
  before: UpdatePlanEntry["before"];
  proposed: UpdatePlanEntry["proposed"];
  selectedByDefault: boolean;
  selectionReason: string;
  dependencies: string[];
  diagnosticFingerprints?: string[];
  scope?: UpdateScope;
  /** Internal only — stripped before the plan is published. */
  beforeValue?: unknown;
  proposedValue?: unknown;
};

function actorAdapterFlags(actor: unknown): UnknownRecord {
  if (!isRecord(actor) || !isRecord(actor.flags)) {
    return {};
  }
  return isRecord(actor.flags[ADAPTER_FLAG_NAMESPACE])
    ? (actor.flags[ADAPTER_FLAG_NAMESPACE] as UnknownRecord)
    : {};
}

function resolveBinding(
  snapshot: AgentSnapshot,
  actor: unknown,
  actorId: string | undefined,
  diagnostics: AdapterDiagnostic[],
  requiredResolutions: ResolutionRequirement[],
): UpdatePlan["binding"] {
  const flags = actorAdapterFlags(actor);
  const targetAgentId = typeof flags.agentId === "string" ? flags.agentId : undefined;
  const targetActorId =
    actorId ??
    (isRecord(actor) && typeof actor._id === "string" ? actor._id : undefined);
  const actorName = isRecord(actor) && typeof actor.name === "string" ? actor.name : "";
  const snapshotName = snapshot.identity.name ?? "";
  const namesMatch = normalizeName(actorName) === normalizeName(snapshotName);

  if (targetAgentId === snapshot.agentId) {
    return {
      state: "bound",
      ...(targetActorId !== undefined ? { targetActorId } : {}),
      targetAgentId,
    };
  }

  if (targetAgentId !== undefined && targetAgentId !== snapshot.agentId) {
    const diag = diagnostic({
      code: plannerDiagnosticCodes.bindingConflict,
      severity: "fatal",
      message:
        "Target Actor is bound to a different canonical agentId; explicit rebind is required before update.",
      targetPath: pointer("flags", ADAPTER_FLAG_NAMESPACE, "agentId"),
      canonicalPath: "/agentId",
      acknowledgement: { kind: "none" },
      remediations: [
        { action: "abort", label: "Abort operation" },
        {
          action: "replaceValue",
          label: "Rebind to imported agentId",
          parameters: { agentId: snapshot.agentId },
        },
      ],
    });
    diagnostics.push(diag);
    requiredResolutions.push({
      diagnosticFingerprint: fingerprintDiagnostic(diag),
      path: pointer("flags", ADAPTER_FLAG_NAMESPACE, "agentId"),
      selectionOptions: diag.remediations,
    });
    return {
      state: "conflict",
      ...(targetActorId !== undefined ? { targetActorId } : {}),
      targetAgentId,
    };
  }

  if (namesMatch) {
    const diag = diagnostic({
      code: plannerDiagnosticCodes.bindingProposed,
      severity: "warning",
      message:
        "Normalized Actor name matches the imported Agent, but no Actor Binding exists. Binding is proposed and must be confirmed.",
      targetPath: "/name",
      canonicalPath: "/identity/name",
      remediations: [
        {
          action: "accept",
          label: "Bind Actor to imported agentId",
          parameters: { agentId: snapshot.agentId },
        },
        { action: "abort", label: "Abort operation" },
      ],
    });
    diagnostics.push(diag);
    requiredResolutions.push({
      diagnosticFingerprint: fingerprintDiagnostic(diag),
      path: "/name",
      selectionOptions: diag.remediations,
    });
    return {
      state: "proposed",
      ...(targetActorId !== undefined ? { targetActorId } : {}),
      proposedByName: true,
    };
  }

  const diag = diagnostic({
    code: plannerDiagnosticCodes.bindingRequired,
    severity: "fatal",
    message:
      "No Actor Binding exists and the Actor name does not match the imported Agent. Name never authorizes an update.",
    targetPath: "/name",
    canonicalPath: "/identity/name",
    acknowledgement: { kind: "none" },
    remediations: [{ action: "abort", label: "Abort operation" }],
  });
  diagnostics.push(diag);
  requiredResolutions.push({
    diagnosticFingerprint: fingerprintDiagnostic(diag),
    path: "/name",
    selectionOptions: diag.remediations,
  });
  return {
    state: "unbound",
    ...(targetActorId !== undefined ? { targetActorId } : {}),
  };
}

function mutableIsFresh(
  snapshot: AgentSnapshot,
  actor: unknown,
  now: string | undefined,
): boolean {
  const capturedAt = snapshot.provenance.capturedAt;
  if (capturedAt === undefined) {
    return false;
  }
  const flags = actorAdapterFlags(actor);
  const audit = isRecord(flags.audit) ? flags.audit : undefined;
  const lastApply =
    audit !== undefined && typeof audit.timestamp === "string" ? audit.timestamp : undefined;
  if (lastApply === undefined) {
    // No prior adapter update: treat imported capture as authoritative only when explicitly newer than "now" is not required.
    // Missing last-apply evidence is stale/unknown per #10.
    return false;
  }
  const reference = now ?? lastApply;
  return Date.parse(capturedAt) > Date.parse(lastApply) && Date.parse(capturedAt) <= Date.parse(reference) + 1;
}

type PushEntryInput = {
  readonly id: string;
  readonly operation: PlanOperation;
  readonly path: string;
  readonly fieldClass: UpdateFieldClass;
  readonly beforeValue: unknown;
  readonly proposedValue: unknown;
  readonly mode: UpdateMode;
  readonly blankTarget: boolean;
  readonly mutableFresh: boolean;
  readonly bound: boolean;
  readonly removalEligible: boolean;
  readonly callerIsGm: boolean;
  readonly collection?: string;
  readonly entity?: { id: string; collection?: string };
  readonly scope?: UpdateScope;
  readonly dependencies?: readonly string[];
  readonly diagnosticFingerprints?: readonly string[];
  readonly selectionReasonOverride?: string;
  readonly selectedOverride?: boolean;
};

function pushEntry(entries: MutableEntry[], input: PushEntryInput): void {
  const selection = defaultSelected(input.fieldClass, input.operation, input.mode, {
    blankTarget: input.blankTarget,
    mutableFresh: input.mutableFresh,
    bound: input.bound,
    removalEligible: input.removalEligible,
    callerIsGm: input.callerIsGm,
  });
  const entry: MutableEntry = {
    id: input.id,
    operation: input.operation,
    path: input.path,
    fieldClass: input.fieldClass,
    before: summarizeValue(input.beforeValue, input.fieldClass),
    proposed: summarizeValue(input.proposedValue, input.fieldClass),
    selectedByDefault:
      input.selectedOverride !== undefined ? input.selectedOverride : selection.selected,
    selectionReason: input.selectionReasonOverride ?? selection.reason,
    dependencies: [...(input.dependencies ?? [])],
    ...(input.beforeValue !== undefined ? { beforeValue: input.beforeValue } : {}),
    ...(input.proposedValue !== undefined ? { proposedValue: input.proposedValue } : {}),
  };
  if (input.collection !== undefined) {
    entry.collection = input.collection;
  }
  if (input.entity !== undefined) {
    entry.entity = input.entity;
  }
  if (input.scope !== undefined) {
    entry.scope = input.scope;
  }
  if (input.diagnosticFingerprints !== undefined) {
    entry.diagnosticFingerprints = [...input.diagnosticFingerprints];
  }
  entries.push(entry);
}

function optionalScope(scope: UpdateScope | undefined): Pick<PushEntryInput, "scope"> {
  return scope === undefined ? {} : { scope };
}

function diffScalarField(
  entries: MutableEntry[],
  ctx: {
    readonly createId: () => string;
    readonly mode: UpdateMode;
    readonly blankTarget: boolean;
    readonly mutableFresh: boolean;
    readonly bound: boolean;
    readonly callerIsGm: boolean;
    readonly path: string;
    readonly beforeValue: unknown;
    readonly proposedValue: unknown;
    readonly dependencies?: readonly string[];
    readonly forceClear?: boolean;
  },
  diagnostics: AdapterDiagnostic[],
): void {
  const classified = classifyPath(ctx.path);
  if (classified.fieldClass === "foundryOwned") {
    return;
  }

  const beforeDefined = ctx.beforeValue !== undefined;
  const proposedDefined = ctx.proposedValue !== undefined && ctx.proposedValue !== null;
  const proposedEmpty =
    ctx.proposedValue === "" ||
    ctx.proposedValue === null ||
    (Array.isArray(ctx.proposedValue) && ctx.proposedValue.length === 0);

  if (!proposedDefined && !ctx.forceClear) {
    if (classified.optionalAbsenceIsNoop || !beforeDefined) {
      return;
    }
  }

  if (deepEqual(ctx.beforeValue, ctx.proposedValue)) {
    return;
  }

  let operation: PlanOperation = "update";
  if (!beforeDefined && proposedDefined && !proposedEmpty) {
    operation = "update";
  }
  if (ctx.forceClear || (proposedEmpty && beforeDefined && ctx.proposedValue !== undefined)) {
    operation = "clear";
    const diag = diagnostic({
      code: plannerDiagnosticCodes.clearWarned,
      severity: "warning",
      message: `Explicit clear proposed at ${ctx.path}; deselected by default.`,
      targetPath: ctx.path,
    });
    diagnostics.push(diag);
    pushEntry(entries, {
      id: ctx.createId(),
      operation,
      path: ctx.path,
      fieldClass: classified.fieldClass,
      beforeValue: ctx.beforeValue,
      proposedValue: ctx.proposedValue,
      mode: ctx.mode,
      blankTarget: ctx.blankTarget,
      mutableFresh: ctx.mutableFresh,
      bound: ctx.bound,
      removalEligible: false,
      callerIsGm: ctx.callerIsGm,
      ...optionalScope(classified.scope),
      ...(ctx.dependencies !== undefined ? { dependencies: ctx.dependencies } : {}),
      diagnosticFingerprints: [fingerprintDiagnostic(diag)],
    });
    return;
  }

  if (classified.fieldClass === "mutable" && !ctx.blankTarget && ctx.mode !== "synchronize") {
    pushEntry(entries, {
      id: ctx.createId(),
      operation: "preserve",
      path: ctx.path,
      fieldClass: "mutable",
      beforeValue: ctx.beforeValue,
      proposedValue: ctx.proposedValue,
      mode: ctx.mode,
      blankTarget: ctx.blankTarget,
      mutableFresh: ctx.mutableFresh,
      bound: ctx.bound,
      removalEligible: false,
      callerIsGm: ctx.callerIsGm,
      ...optionalScope(classified.scope),
      ...(ctx.dependencies !== undefined ? { dependencies: ctx.dependencies } : {}),
    });
    if (!deepEqual(ctx.beforeValue, ctx.proposedValue)) {
      diagnostics.push(
        diagnostic({
          code: catalogueDiagnosticCodes.mutableStateReplacement,
          severity: "warning",
          message: `Mutable campaign state at ${ctx.path} differs from the import and is preserved by default.`,
          targetPath: ctx.path,
          remediations: [
            { action: "keepTarget", label: "Keep target value" },
            { action: "replaceValue", label: "Use imported value" },
          ],
        }),
      );
    }
    return;
  }

  pushEntry(entries, {
    id: ctx.createId(),
    operation,
    path: ctx.path,
    fieldClass: classified.fieldClass,
    beforeValue: ctx.beforeValue,
    proposedValue: ctx.proposedValue,
    mode: ctx.mode,
    blankTarget: ctx.blankTarget,
    mutableFresh: ctx.mutableFresh,
    bound: ctx.bound,
    removalEligible: false,
    callerIsGm: ctx.callerIsGm,
    ...optionalScope(classified.scope),
    ...(ctx.dependencies !== undefined ? { dependencies: ctx.dependencies } : {}),
  });
}

function readSystem(actor: unknown): UnknownRecord {
  return isRecord(actor) && isRecord(actor.system) ? actor.system : {};
}

function planActorScalars(
  entries: MutableEntry[],
  snapshot: AgentSnapshot,
  target: unknown,
  desired: unknown,
  ctx: {
    readonly createId: () => string;
    readonly mode: UpdateMode;
    readonly blankTarget: boolean;
    readonly mutableFresh: boolean;
    readonly bound: boolean;
    readonly callerIsGm: boolean;
    readonly bindEntryId?: string;
  },
  diagnostics: AdapterDiagnostic[],
): void {
  const targetSystem = readSystem(target);
  const desiredSystem = readSystem(desired);
  const deps = ctx.bindEntryId !== undefined ? [ctx.bindEntryId] : [];

  const targetName = isRecord(target) ? target.name : undefined;
  const desiredName = isRecord(desired) ? desired.name : undefined;
  diffScalarField(
    entries,
    {
      ...ctx,
      path: "/name",
      beforeValue: targetName,
      proposedValue: desiredName,
      dependencies: deps,
    },
    diagnostics,
  );

  const biographyKeys = ["profession", "employer", "nationality", "sex", "age", "education"] as const;
  const targetBio = isRecord(targetSystem.biography) ? targetSystem.biography : {};
  const desiredBio = isRecord(desiredSystem.biography) ? desiredSystem.biography : {};
  for (const key of biographyKeys) {
    diffScalarField(
      entries,
      {
        ...ctx,
        path: pointer("system", "biography", key),
        beforeValue: targetBio[key],
        proposedValue: desiredBio[key],
        dependencies: deps,
      },
      diagnostics,
    );
  }

  const targetPhysical = isRecord(targetSystem.physical) ? targetSystem.physical : {};
  const desiredPhysical = isRecord(desiredSystem.physical) ? desiredSystem.physical : {};
  for (const key of ["description", "wounds", "firstAidAttempted", "exhausted", "exhaustedPenalty"] as const) {
    diffScalarField(
      entries,
      {
        ...ctx,
        path: pointer("system", "physical", key),
        beforeValue: targetPhysical[key],
        proposedValue: desiredPhysical[key],
        dependencies: deps,
      },
      diagnostics,
    );
  }

  const targetStats = isRecord(targetSystem.statistics) ? targetSystem.statistics : {};
  const desiredStats = isRecord(desiredSystem.statistics) ? desiredSystem.statistics : {};
  for (const key of Object.keys({ ...targetStats, ...desiredStats })) {
    const before = isRecord(targetStats[key]) ? (targetStats[key] as UnknownRecord) : {};
    const proposed = isRecord(desiredStats[key]) ? (desiredStats[key] as UnknownRecord) : {};
    for (const field of ["value", "distinguishing_feature"] as const) {
      diffScalarField(
        entries,
        {
          ...ctx,
          path: pointer("system", "statistics", key, field),
          beforeValue: before[field],
          proposedValue: proposed[field],
          dependencies: deps,
        },
        diagnostics,
      );
    }
  }

  for (const resource of [
    { key: "health", fields: ["value", "max"] as const },
    { key: "wp", fields: ["value", "max"] as const },
  ] as const) {
    const before = isRecord(targetSystem[resource.key])
      ? (targetSystem[resource.key] as UnknownRecord)
      : {};
    const proposed = isRecord(desiredSystem[resource.key])
      ? (desiredSystem[resource.key] as UnknownRecord)
      : {};
    for (const field of resource.fields) {
      diffScalarField(
        entries,
        {
          ...ctx,
          path: pointer("system", resource.key, field),
          beforeValue: before[field],
          proposedValue: proposed[field],
          dependencies: deps,
        },
        diagnostics,
      );
    }
  }

  const targetSanity = isRecord(targetSystem.sanity) ? targetSystem.sanity : {};
  const desiredSanity = isRecord(desiredSystem.sanity) ? desiredSystem.sanity : {};
  for (const field of ["value", "currentBreakingPoint"] as const) {
    diffScalarField(
      entries,
      {
        ...ctx,
        path: pointer("system", "sanity", field),
        beforeValue: targetSanity[field],
        proposedValue: desiredSanity[field],
        dependencies: deps,
      },
      diagnostics,
    );
  }

  const targetAdapt = isRecord(targetSanity.adaptations) ? targetSanity.adaptations : {};
  const desiredAdapt = isRecord(desiredSanity.adaptations) ? desiredSanity.adaptations : {};
  for (const kind of ["violence", "helplessness"] as const) {
    const before = isRecord(targetAdapt[kind]) ? (targetAdapt[kind] as UnknownRecord) : {};
    const proposed = isRecord(desiredAdapt[kind]) ? (desiredAdapt[kind] as UnknownRecord) : {};
    for (const bit of ["incident1", "incident2", "incident3"] as const) {
      diffScalarField(
        entries,
        {
          ...ctx,
          path: pointer("system", "sanity", "adaptations", kind, bit),
          beforeValue: before[bit],
          proposedValue: proposed[bit],
          dependencies: deps,
        },
        diagnostics,
      );
    }
  }

  const targetCorruption = isRecord(targetSystem.corruption) ? targetSystem.corruption : {};
  const desiredCorruption = isRecord(desiredSystem.corruption) ? desiredSystem.corruption : {};
  for (const field of ["value", "haveSeenTheYellowSign", "gift", "insight"] as const) {
    diffScalarField(
      entries,
      {
        ...ctx,
        path: pointer("system", "corruption", field),
        beforeValue: targetCorruption[field],
        proposedValue: desiredCorruption[field],
        dependencies: deps,
      },
      diagnostics,
    );
  }

  const targetSkills = isRecord(targetSystem.skills) ? targetSystem.skills : {};
  const desiredSkills = isRecord(desiredSystem.skills) ? desiredSystem.skills : {};
  for (const key of Object.keys({ ...targetSkills, ...desiredSkills })) {
    const before = isRecord(targetSkills[key]) ? (targetSkills[key] as UnknownRecord) : {};
    const proposed = isRecord(desiredSkills[key]) ? (desiredSkills[key] as UnknownRecord) : {};
    for (const field of ["proficiency", "label", "failure"] as const) {
      if (proposed[field] === undefined && before[field] === undefined) {
        continue;
      }
      diffScalarField(
        entries,
        {
          ...ctx,
          path: pointer("system", "skills", key, field),
          beforeValue: before[field],
          proposedValue: proposed[field],
          dependencies: deps,
        },
        diagnostics,
      );
    }
  }

  // Adapter identity flag
  const targetFlags = actorAdapterFlags(target);
  diffScalarField(
    entries,
    {
      ...ctx,
      path: pointer("flags", ADAPTER_FLAG_NAMESPACE, "agentId"),
      beforeValue: targetFlags.agentId,
      proposedValue: snapshot.agentId,
      dependencies: deps,
    },
    diagnostics,
  );
}

function planCollections(
  entries: MutableEntry[],
  snapshot: AgentSnapshot,
  desiredActor: unknown,
  targetActor: unknown,
  ctx: {
    readonly createId: () => string;
    readonly mode: UpdateMode;
    readonly blankTarget: boolean;
    readonly mutableFresh: boolean;
    readonly bound: boolean;
    readonly callerIsGm: boolean;
    readonly bindEntryId?: string;
    readonly scopes: Record<string, { complete: boolean; completenessBlockedBy?: string[] }>;
  },
  diagnostics: AdapterDiagnostic[],
  requiredResolutions: ResolutionRequirement[],
): void {
  const desiredItems = desiredItemsFromSnapshotAndExport(snapshot, desiredActor);
  const targetItems = readTargetItems(targetActor);
  const matches = matchCollections(desiredItems, targetItems);
  const deps = ctx.bindEntryId !== undefined ? [ctx.bindEntryId] : [];

  for (const match of matches) {
    if (match.kind === "ambiguous") {
      const diag = diagnostic({
        code: catalogueDiagnosticCodes.ambiguousIdentity,
        severity: "error",
        message: `Ambiguous ${match.desired.type} match for "${match.desired.name}"; array position is never used.`,
        targetPath: "/items",
        canonicalPath: `/inventory/${match.desired.type}`,
        entity: { id: match.desired.canonicalId, collection: match.desired.type },
        remediations: match.candidates.map((candidate) => ({
          action: "chooseTarget" as const,
          label: `Bind to Item ${candidate.id}`,
          parameters: { targetItemId: candidate.id },
        })),
      });
      diagnostics.push(diag);
      requiredResolutions.push({
        diagnosticFingerprint: fingerprintDiagnostic(diag),
        entityId: match.desired.canonicalId,
        selectionOptions: diag.remediations,
      });
      continue;
    }

    if (match.kind === "addition") {
      const scope = scopeForItemType(match.desired.type);
      pushEntry(entries, {
        id: ctx.createId(),
        operation: "add",
        path: "/items",
        fieldClass: match.desired.systemManaged ? "systemManaged" : "profile",
        beforeValue: undefined,
        proposedValue: {
          name: match.desired.name,
          type: match.desired.type,
          system: match.desired.system,
          flags: {
            ...match.desired.flags,
            [ADAPTER_FLAG_NAMESPACE]: { canonicalId: match.desired.canonicalId },
          },
        },
        mode: ctx.mode,
        blankTarget: ctx.blankTarget,
        mutableFresh: ctx.mutableFresh,
        bound: ctx.bound,
        removalEligible: false,
        callerIsGm: ctx.callerIsGm,
        collection: match.desired.type,
        entity: { id: match.desired.canonicalId, collection: match.desired.type },
        ...optionalScope(scope),
        dependencies: deps,
        ...(ctx.blankTarget
          ? {
              selectionReasonOverride:
                "Blank fingerprint initialization adds missing Item types without mapping warnings.",
            }
          : {}),
      });
      continue;
    }

    if (match.kind === "unmatchedTarget") {
      const scope = scopeForItemType(match.target.type);
      const scopeComplete = scope !== undefined && ctx.scopes[scope]?.complete === true;
      const eligible =
        !match.target.systemManaged &&
        match.target.boundCanonicalId !== undefined &&
        scopeComplete &&
        (ctx.mode === "replace" || ctx.mode === "synchronize");

      if (ctx.mode === "merge") {
        pushEntry(entries, {
          id: ctx.createId(),
          operation: "preserve",
          path: pointer("items", match.target.id),
          fieldClass: match.target.systemManaged ? "systemManaged" : "profile",
          beforeValue: { name: match.target.name, type: match.target.type },
          proposedValue: { name: match.target.name, type: match.target.type },
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          removalEligible: false,
          callerIsGm: ctx.callerIsGm,
          collection: match.target.type,
          entity: {
            id: match.target.boundCanonicalId ?? match.target.id,
            collection: match.target.type,
          },
          ...optionalScope(scope),
          dependencies: deps,
          selectionReasonOverride: "Merge preserves unmatched existing entries.",
        });
        continue;
      }

      if (match.target.systemManaged) {
        const diag = diagnostic({
          code: plannerDiagnosticCodes.protectedRemoval,
          severity: "warning",
          message: "System-managed Unarmed Attack is protected from default deletion.",
          targetPath: pointer("items", match.target.id),
          entity: { id: match.target.id, collection: "weapon" },
        });
        diagnostics.push(diag);
        pushEntry(entries, {
          id: ctx.createId(),
          operation: "remove",
          path: pointer("items", match.target.id),
          fieldClass: "systemManaged",
          beforeValue: { name: match.target.name, type: match.target.type },
          proposedValue: undefined,
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          removalEligible: false,
          callerIsGm: ctx.callerIsGm,
          collection: match.target.type,
          entity: { id: match.target.id, collection: match.target.type },
          ...optionalScope(scope),
          dependencies: deps,
          diagnosticFingerprints: [fingerprintDiagnostic(diag)],
        });
        continue;
      }

      if (!scopeComplete) {
        diagnostics.push(
          diagnostic({
            code: plannerDiagnosticCodes.incompleteScope,
            severity: "warning",
            message: `Scope ${scope ?? match.target.type} is not proven complete; absence cannot authorize removal.`,
            targetPath: pointer("items", match.target.id),
          }),
        );
        pushEntry(entries, {
          id: ctx.createId(),
          operation: "preserve",
          path: pointer("items", match.target.id),
          fieldClass: "profile",
          beforeValue: { name: match.target.name, type: match.target.type },
          proposedValue: { name: match.target.name, type: match.target.type },
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          removalEligible: false,
          callerIsGm: ctx.callerIsGm,
          collection: match.target.type,
          entity: { id: match.target.id, collection: match.target.type },
          ...optionalScope(scope),
          dependencies: deps,
        });
        continue;
      }

      pushEntry(entries, {
        id: ctx.createId(),
        operation: "remove",
        path: pointer("items", match.target.id),
        fieldClass: "profile",
        beforeValue: { name: match.target.name, type: match.target.type, system: match.target.system },
        proposedValue: undefined,
        mode: ctx.mode,
        blankTarget: ctx.blankTarget,
        mutableFresh: ctx.mutableFresh,
        bound: ctx.bound,
        removalEligible: eligible,
        callerIsGm: ctx.callerIsGm,
        collection: match.target.type,
        entity: {
          id: match.target.boundCanonicalId ?? match.target.id,
          collection: match.target.type,
        },
        ...optionalScope(scope),
        dependencies: deps,
        ...(!eligible
          ? {
              selectedOverride: false,
              selectionReasonOverride:
                "Unbound pre-existing entries are offered only as individually deselected removals.",
            }
          : {}),
      });
      continue;
    }

    // matched bound / provenance / uniqueSemantic
    if (match.kind === "uniqueSemantic") {
      diagnostics.push(
        diagnostic({
          code: catalogueDiagnosticCodes.safeNormalization,
          severity: "warning",
          message: `Unique semantic match for ${match.desired.type} "${match.desired.name}" proposes binding.`,
          targetPath: pointer("items", match.target.id),
          entity: { id: match.desired.canonicalId, collection: match.desired.type },
        }),
      );
      pushEntry(entries, {
        id: ctx.createId(),
        operation: "bind",
        path: pointer("items", match.target.id, "flags", ADAPTER_FLAG_NAMESPACE, "canonicalId"),
        fieldClass: "adapterOwned",
        beforeValue: match.target.boundCanonicalId,
        proposedValue: match.desired.canonicalId,
        mode: ctx.mode,
        blankTarget: ctx.blankTarget,
        mutableFresh: ctx.mutableFresh,
        bound: ctx.bound,
        removalEligible: false,
        callerIsGm: ctx.callerIsGm,
        collection: match.desired.type,
        entity: { id: match.desired.canonicalId, collection: match.desired.type },
        ...optionalScope(scopeForItemType(match.desired.type)),
        dependencies: deps,
        selectedOverride: true,
        selectionReasonOverride:
          "Unique subtype plus normalized semantic identity proposes a binding.",
      });
    }

    const itemPath = pointer("items", match.target.id);
    const scope = scopeForItemType(match.desired.type);
    if (match.desired.name !== match.target.name) {
      diffScalarField(
        entries,
        {
          createId: ctx.createId,
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          callerIsGm: ctx.callerIsGm,
          path: `${itemPath}/name`,
          beforeValue: match.target.name,
          proposedValue: match.desired.name,
          dependencies: deps,
        },
        diagnostics,
      );
    }

    for (const key of new Set([
      ...Object.keys(match.target.system),
      ...Object.keys(match.desired.system),
    ])) {
      const beforeValue = match.target.system[key];
      const proposedValue = match.desired.system[key];
      if (deepEqual(beforeValue, proposedValue)) {
        continue;
      }
      // Nested objects (sanity blocks) compared as wholes for planner entries.
      diffScalarField(
        entries,
        {
          createId: ctx.createId,
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          callerIsGm: ctx.callerIsGm,
          path: `${itemPath}/system/${key}`,
          beforeValue,
          proposedValue,
          dependencies: deps,
        },
        diagnostics,
      );
    }
    void scope;
  }
}

function buildScopes(
  exportDiagnostics: readonly AdapterDiagnostic[],
): Record<string, { complete: boolean; completenessBlockedBy?: string[] }> {
  const blocking = exportDiagnostics
    .filter((entry) => entry.severity === "fatal" || entry.severity === "error")
    .map((entry) => entry.code);
  const complete = blocking.length === 0;
  const scopes: Record<string, { complete: boolean; completenessBlockedBy?: string[] }> = {};
  for (const scope of updateScopes) {
    scopes[scope] = complete
      ? { complete: true }
      : { complete: false, completenessBlockedBy: blocking };
  }
  // Exact export capability proves these Agent scopes when conversion is unblocked.
  return scopes;
}

function applySelectionOverrides(
  entries: MutableEntry[],
  overrides: Readonly<Record<string, boolean>> | undefined,
  diagnostics: AdapterDiagnostic[],
): MutableEntry[] {
  const selected = new Map(entries.map((entry) => [entry.id, entry.selectedByDefault]));
  if (overrides !== undefined) {
    for (const [id, value] of Object.entries(overrides)) {
      if (selected.has(id)) {
        selected.set(id, value);
      }
    }
  }

  // Dependency validation always runs: dependents cannot stay selected if a dependency is not.
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      if (selected.get(entry.id) !== true) {
        continue;
      }
      for (const dependencyId of entry.dependencies) {
        if (selected.get(dependencyId) !== true) {
          selected.set(entry.id, false);
          if (overrides !== undefined && overrides[entry.id] === true) {
            diagnostics.push(
              diagnostic({
                code: catalogueDiagnosticCodes.derivedConflict,
                severity: "warning",
                message: `Deselected dependency ${dependencyId} forced deselection of ${entry.id}.`,
                targetPath: entry.path,
              }),
            );
          }
          changed = true;
        }
      }
    }
  }

  return entries.map((entry) => ({
    ...entry,
    selectedByDefault: selected.get(entry.id) ?? entry.selectedByDefault,
  }));
}

function planDigest(entries: readonly UpdatePlanEntry[], mode: UpdateMode): string {
  return contentHash({
    mode,
    entries: entries.map((entry) => ({
      id: entry.id,
      operation: entry.operation,
      path: entry.path,
      selectedByDefault: entry.selectedByDefault,
      fieldClass: entry.fieldClass,
      proposed: entry.proposed,
      before: entry.before,
    })),
  });
}

/**
 * Pure Actor Binding + immutable Merge/Replace/Synchronize Update Plan (#7, #10, #26).
 */
export function planFoundryActorUpdate(
  snapshot: AgentSnapshot | unknown,
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
  const entries: MutableEntry[] = [];

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

  // Destructive modes require recovery eligibility metadata on the plan.
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
    planActorScalars(
      entries,
      agent,
      actorSource,
      desiredActor,
      {
        createId,
        mode,
        blankTarget,
        mutableFresh,
        bound,
        callerIsGm,
        ...(bindEntryId !== undefined ? { bindEntryId } : {}),
      },
      diagnostics,
    );
    planCollections(
      entries,
      agent,
      desiredActor,
      actorSource,
      {
        createId,
        mode,
        blankTarget,
        mutableFresh,
        bound,
        callerIsGm,
        scopes,
        ...(bindEntryId !== undefined ? { bindEntryId } : {}),
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

  // Refine already-up-to-date: when bound and no selected write ops.
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

  const publishedEntries = overridden.map((entry) => ({
    id: entry.id,
    operation: entry.operation,
    path: entry.path,
    fieldClass: entry.fieldClass,
    before: entry.before,
    proposed: entry.proposed,
    selectedByDefault: entry.selectedByDefault,
    selectionReason: entry.selectionReason,
    dependencies: entry.dependencies,
    ...(entry.collection !== undefined ? { collection: entry.collection } : {}),
    ...(entry.entity !== undefined ? { entity: entry.entity } : {}),
    ...(entry.scope !== undefined ? { scope: entry.scope } : {}),
    ...(entry.diagnosticFingerprints !== undefined
      ? { diagnosticFingerprints: entry.diagnosticFingerprints }
      : {}),
  }));

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
    entries: publishedEntries,
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
