import type { AdapterDiagnostic, ResolutionRequirement } from "@delta-green-character-adapter/adapter-core";
import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { AgentSnapshot } from "@delta-green-character-adapter/character-model";

import { diagnostic, plannerDiagnosticCodes } from "./diagnostics.js";
import type { UpdatePlan } from "./schemas.js";
import { isRecord, normalizeName, type UnknownRecord } from "./util.js";

export function actorAdapterFlags(actor: unknown): UnknownRecord {
  if (!isRecord(actor) || !isRecord(actor.flags)) {
    return {};
  }
  return isRecord(actor.flags[ADAPTER_FLAG_NAMESPACE])
    ? (actor.flags[ADAPTER_FLAG_NAMESPACE] as UnknownRecord)
    : {};
}

/**
 * Describe stored agentId vs imported snapshot for audit metadata.
 * The open Agent sheet is the import target — this never blocks planning or apply.
 * Successful apply writes agentId via compact audit flags.
 */
export function resolveBinding(
  snapshot: AgentSnapshot,
  actor: unknown,
  actorId: string | undefined,
  diagnostics: AdapterDiagnostic[],
  _requiredResolutions: ResolutionRequirement[],
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
    diagnostics.push(
      diagnostic({
        code: plannerDiagnosticCodes.bindingConflict,
        severity: "information",
        message:
          "Stored agentId differs from the import; apply will update adapter audit identity on this Actor.",
        targetPath: `/flags/${ADAPTER_FLAG_NAMESPACE}/agentId`,
        canonicalPath: "/agentId",
        completenessImpact: "none",
        acknowledgement: { kind: "none" },
        remediations: [],
      }),
    );
    return {
      state: "conflict",
      ...(targetActorId !== undefined ? { targetActorId } : {}),
      targetAgentId,
    };
  }

  if (namesMatch) {
    return {
      state: "proposed",
      ...(targetActorId !== undefined ? { targetActorId } : {}),
      proposedByName: true,
    };
  }

  if (actorName.length > 0 && snapshotName.length > 0 && !namesMatch) {
    diagnostics.push(
      diagnostic({
        code: plannerDiagnosticCodes.bindingRequired,
        severity: "information",
        message:
          "Actor name differs from the imported Agent. Import still targets this open sheet; apply updates the Actor and audit identity.",
        targetPath: "/name",
        canonicalPath: "/identity/name",
        completenessImpact: "none",
        acknowledgement: { kind: "none" },
        remediations: [],
      }),
    );
  }

  return {
    state: "unbound",
    ...(targetActorId !== undefined ? { targetActorId } : {}),
  };
}

export function mutableIsFresh(
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
    return false;
  }
  const reference = now ?? lastApply;
  return (
    Date.parse(capturedAt) > Date.parse(lastApply) &&
    Date.parse(capturedAt) <= Date.parse(reference) + 1
  );
}
