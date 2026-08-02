import {
  ADAPTER_FLAG_NAMESPACE,
  EXPORT_ADAPTER_ID,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { UpdatePlan, UpdateScope } from "@delta-green-character-adapter/foundry-update-planner";
import type { MaterializedApplyAction } from "@delta-green-character-adapter/foundry-update-planner";

import { pointerToActorUpdateKey } from "./paths.js";
import type { FoundryActorRuntime } from "./runtime.js";

export type CompactApplyAudit = {
  readonly capabilityId: string;
  readonly adapterIds: readonly string[];
  readonly adapterVersion: string;
  readonly sourceContentHash: string;
  readonly planDigest: string;
  readonly targetFingerprint: string;
  readonly resultFingerprint: string;
  readonly mode: UpdatePlan["mode"] | "create";
  readonly affectedScopes: readonly string[];
  readonly operationCounts: Readonly<Record<string, number>>;
  readonly userId: string;
  readonly timestamp: string;
  readonly agentId: string;
  /** Non-sensitive binding map identities only; never deleted values or recovery snapshots. */
  readonly bindings?: unknown;
};

export function countOperations(
  actions: readonly MaterializedApplyAction[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const action of actions) {
    counts[action.operation] = (counts[action.operation] ?? 0) + 1;
  }
  return counts;
}

export function affectedScopesFromActions(
  actions: readonly MaterializedApplyAction[],
): UpdateScope[] {
  const scopes = new Set<UpdateScope>();
  for (const action of actions) {
    if (action.scope !== undefined) {
      scopes.add(action.scope);
    }
  }
  return [...scopes].sort();
}

export function buildCompactAudit(input: {
  readonly plan: UpdatePlan;
  readonly actions: readonly MaterializedApplyAction[];
  readonly adapterVersion: string;
  readonly targetFingerprint: string;
  readonly resultFingerprint: string;
  readonly userId: string;
  readonly timestamp: string;
  readonly bindings?: unknown;
}): CompactApplyAudit {
  return {
    capabilityId: input.plan.capabilityId,
    adapterIds: [...input.plan.auditPreview.adapterIds],
    adapterVersion: input.adapterVersion,
    sourceContentHash: input.plan.sourceContentHash,
    planDigest: input.plan.planDigest,
    targetFingerprint: input.targetFingerprint,
    resultFingerprint: input.resultFingerprint,
    mode: input.plan.mode,
    affectedScopes: affectedScopesFromActions(input.actions),
    operationCounts: countOperations(input.actions),
    userId: input.userId,
    timestamp: input.timestamp,
    agentId: input.plan.agentId,
    ...(input.bindings !== undefined ? { bindings: input.bindings } : {}),
  };
}

/**
 * Persist compact audit + agentId under the adapter flag namespace.
 * Never writes recovery snapshots, raw source, secrets, or deleted values.
 */
export async function writeCompactAuditFlags(
  runtime: FoundryActorRuntime,
  audit: CompactApplyAudit,
  bindings?: unknown,
): Promise<void> {
  const persistedBindings = bindings !== undefined ? bindings : audit.bindings;
  const diff: Record<string, unknown> = {
    [pointerToActorUpdateKey(`/flags/${ADAPTER_FLAG_NAMESPACE}/agentId`)]: audit.agentId,
    [pointerToActorUpdateKey(`/flags/${ADAPTER_FLAG_NAMESPACE}/audit`)]: {
      capabilityId: audit.capabilityId,
      adapterIds: audit.adapterIds.length > 0 ? audit.adapterIds : [EXPORT_ADAPTER_ID],
      adapterVersion: audit.adapterVersion,
      sourceContentHash: audit.sourceContentHash,
      planDigest: audit.planDigest,
      targetFingerprint: audit.targetFingerprint,
      resultFingerprint: audit.resultFingerprint,
      mode: audit.mode,
      affectedScopes: audit.affectedScopes,
      operationCounts: audit.operationCounts,
      userId: audit.userId,
      timestamp: audit.timestamp,
      agentId: audit.agentId,
      ...(persistedBindings !== undefined ? { bindings: persistedBindings } : {}),
    },
  };

  if (persistedBindings !== undefined) {
    diff[pointerToActorUpdateKey(`/flags/${ADAPTER_FLAG_NAMESPACE}/bindings`)] = persistedBindings;
  }

  await runtime.updateActor(diff);
}

export function auditSummaryForOutput(audit: CompactApplyAudit): CompactApplyAudit {
  return { ...audit };
}
