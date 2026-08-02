import {
  createOperationResult,
  sortDiagnostics,
  type AdapterDiagnostic,
  type AdapterOperationResult,
} from "@delta-green-character-adapter/adapter-core";

import { targetActorFingerprint } from "./blank-fingerprint.js";
import { diagnostic, plannerDiagnosticCodes } from "./diagnostics.js";
import type { DraftPlanEntry } from "./entries.js";
import { composeDraftPlan, type PlanFoundryActorUpdateOptions } from "./plan.js";
import {
  parseUpdatePlan,
  type PlanOperation,
  type UpdateFieldClass,
  type UpdatePlan,
  type UpdateScope,
} from "./schemas.js";
import { applySelectionOverrides } from "./selection.js";

const WRITE_OPERATIONS = new Set<PlanOperation>(["bind", "add", "update", "clear", "remove"]);

export type MaterializedApplyAction = {
  readonly entryId: string;
  readonly operation: Exclude<PlanOperation, "preserve">;
  readonly path: string;
  readonly fieldClass: UpdateFieldClass;
  readonly collection?: string;
  readonly entity?: { id: string; collection?: string };
  readonly scope?: UpdateScope;
  readonly dependencies: readonly string[];
  /** Concrete proposed value for bind/add/update/clear. Absent for remove. */
  readonly value?: unknown;
};

export type MaterializeSelectedPlanActionsOptions = Omit<
  PlanFoundryActorUpdateOptions,
  "selectionOverrides" | "mode"
>;

function entryCorrelationKey(entry: {
  readonly operation: string;
  readonly path: string;
  readonly fieldClass: string;
  readonly collection?: string | undefined;
  readonly entity?: { id: string; collection?: string | undefined } | undefined;
}): string {
  return [
    entry.operation,
    entry.path,
    entry.fieldClass,
    entry.collection ?? "",
    entry.entity?.id ?? "",
    entry.entity?.collection ?? "",
  ].join("\0");
}

function operationRank(operation: PlanOperation): number {
  switch (operation) {
    case "bind":
      return 0;
    case "add":
      return 1;
    case "update":
      return 2;
    case "clear":
      return 3;
    case "remove":
      return 4;
    default:
      return 5;
  }
}

function toAction(entry: DraftPlanEntry): MaterializedApplyAction {
  return {
    entryId: entry.id,
    operation: entry.operation as Exclude<PlanOperation, "preserve">,
    path: entry.path,
    fieldClass: entry.fieldClass,
    dependencies: entry.dependencies,
    ...(entry.collection !== undefined ? { collection: entry.collection } : {}),
    ...(entry.entity !== undefined ? { entity: entry.entity } : {}),
    ...(entry.scope !== undefined ? { scope: entry.scope } : {}),
    ...(entry.operation !== "remove" ? { value: entry.proposedValue } : {}),
  };
}

function topologicalActions(entries: readonly DraftPlanEntry[]): MaterializedApplyAction[] {
  const selected = entries.filter(
    (entry) => entry.selectedByDefault && WRITE_OPERATIONS.has(entry.operation),
  );
  const byId = new Map(selected.map((entry) => [entry.id, entry]));
  const remaining = new Set(byId.keys());
  const ordered: DraftPlanEntry[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining]
      .map((id) => byId.get(id)!)
      .filter((entry) =>
        entry.dependencies.every(
          (dependencyId) => !remaining.has(dependencyId) || !byId.has(dependencyId),
        ),
      )
      .sort((left, right) => {
        const byOp = operationRank(left.operation) - operationRank(right.operation);
        if (byOp !== 0) {
          return byOp;
        }
        return left.path.localeCompare(right.path);
      });

    if (ready.length === 0) {
      const rest = [...remaining]
        .map((id) => byId.get(id)!)
        .sort((left, right) => left.path.localeCompare(right.path));
      for (const entry of rest) {
        remaining.delete(entry.id);
        ordered.push(entry);
      }
      break;
    }

    for (const entry of ready) {
      remaining.delete(entry.id);
      ordered.push(entry);
    }
  }

  return ordered.map(toAction);
}

/**
 * Re-derive concrete selected write actions from a validated Update Plan (#27).
 * Public plan entries only carry safe summaries; apply needs draft values.
 */
export function materializeSelectedPlanActions(
  snapshot: unknown,
  actorSource: unknown,
  planInput: unknown,
  options: MaterializeSelectedPlanActionsOptions = {},
): AdapterOperationResult & { readonly actions?: readonly MaterializedApplyAction[] } {
  const diagnostics: AdapterDiagnostic[] = [];
  let plan: UpdatePlan;
  try {
    plan = parseUpdatePlan(planInput);
  } catch (error) {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: plannerDiagnosticCodes.malformedStructure,
          severity: "fatal",
          message: `Update Plan failed validation: ${error instanceof Error ? error.message : String(error)}`,
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  const liveFingerprint = targetActorFingerprint(actorSource);
  if (liveFingerprint !== plan.targetFingerprint) {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: plannerDiagnosticCodes.staleState,
          severity: "fatal",
          message: "Target Actor fingerprint changed since preview; replan before apply.",
          targetPath: "/_id",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  const selectionByKey = new Map(
    plan.entries.map((entry) => [entryCorrelationKey(entry), entry.selectedByDefault]),
  );

  const composed = composeDraftPlan(snapshot, actorSource, {
    ...options,
    mode: plan.mode,
    callerIsGm: options.callerIsGm ?? plan.permissions.callerIsGm === true,
  });
  if (composed.blocked || composed.drafts === undefined || composed.agent === undefined) {
    return createOperationResult({
      diagnostics: sortDiagnostics([...composed.diagnostics, ...diagnostics]),
      requiredResolutions: composed.requiredResolutions,
    });
  }

  if (composed.agent.provenance.contentHash !== plan.sourceContentHash) {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: plannerDiagnosticCodes.staleState,
          severity: "fatal",
          message:
            "Canonical source content hash changed since preview; replan before apply.",
          canonicalPath: "/provenance/contentHash",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  const correlatedOverrides: Record<string, boolean> = {};
  for (const draft of composed.drafts) {
    const key = entryCorrelationKey(draft);
    const selected = selectionByKey.get(key);
    if (selected !== undefined) {
      correlatedOverrides[draft.id] = selected;
    }
  }

  const overridden = applySelectionOverrides(
    composed.drafts.map((entry) => ({ ...entry })),
    correlatedOverrides,
    diagnostics,
  );

  const plannedKeys = new Set(
    plan.entries
      .filter((entry) => entry.selectedByDefault && WRITE_OPERATIONS.has(entry.operation))
      .map((entry) => entryCorrelationKey(entry)),
  );
  const materialKeys = new Set(
    overridden
      .filter((entry) => entry.selectedByDefault && WRITE_OPERATIONS.has(entry.operation))
      .map((entry) => entryCorrelationKey(entry)),
  );
  if (
    plannedKeys.size !== materialKeys.size ||
    [...plannedKeys].some((key) => !materialKeys.has(key))
  ) {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: plannerDiagnosticCodes.staleState,
          severity: "fatal",
          message:
            "Update Plan selection no longer matches a fresh plan for this Actor; replan before apply.",
          targetPath: "/_id",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  if (plan.alreadyUpToDate || composed.alreadyUpToDate) {
    return {
      ...createOperationResult({
        diagnostics: sortDiagnostics([...composed.diagnostics, ...diagnostics]),
        requiredResolutions: [],
        plan,
      }),
      actions: [] as const,
    };
  }

  return {
    ...createOperationResult({
      diagnostics: sortDiagnostics([...composed.diagnostics, ...diagnostics]),
      requiredResolutions: composed.requiredResolutions,
      plan,
    }),
    actions: topologicalActions(overridden),
  };
}
