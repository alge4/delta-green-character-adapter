import {
  fingerprintDiagnostic,
  type AdapterDiagnostic,
  type ResolutionRequirement,
} from "@delta-green-character-adapter/adapter-core";
import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { AgentSnapshot } from "@delta-green-character-adapter/character-model";

import { diagnostic, plannerDiagnosticCodes } from "./diagnostics.js";
import type { UpdatePlan } from "./schemas.js";
import { isRecord, normalizeName, pointer, type UnknownRecord } from "./util.js";

export function actorAdapterFlags(actor: unknown): UnknownRecord {
  if (!isRecord(actor) || !isRecord(actor.flags)) {
    return {};
  }
  return isRecord(actor.flags[ADAPTER_FLAG_NAMESPACE])
    ? (actor.flags[ADAPTER_FLAG_NAMESPACE] as UnknownRecord)
    : {};
}

export function resolveBinding(
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
