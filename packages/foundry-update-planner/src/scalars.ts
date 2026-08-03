import {
  fingerprintDiagnostic,
  type AdapterDiagnostic,
} from "@delta-green-character-adapter/adapter-core";
import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { AgentSnapshot } from "@delta-green-character-adapter/character-model";

import { actorAdapterFlags } from "./binding.js";
import { catalogueDiagnosticCodes, diagnostic, plannerDiagnosticCodes } from "./diagnostics.js";
import { optionalScope, pushEntry, type DraftPlanEntry } from "./entries.js";
import { classifyPath } from "./field-classes.js";
import type { PlanOperation, UpdateMode } from "./schemas.js";
import { deepEqual, isRecord, pointer, type UnknownRecord } from "./util.js";

function readSystem(actor: unknown): UnknownRecord {
  return isRecord(actor) && isRecord(actor.system) ? actor.system : {};
}

export function diffScalarField(
  entries: DraftPlanEntry[],
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

  // Mutable campaign state: propose an update that is deselected by default so the
  // user can opt in. Do not use "preserve" here — that operation never writes even
  // when the checkbox is selected (#40).
  if (classified.fieldClass === "mutable" && !ctx.blankTarget && ctx.mode !== "synchronize") {
    pushEntry(entries, {
      id: ctx.createId(),
      operation: "update",
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

export function planActorScalars(
  entries: DraftPlanEntry[],
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
