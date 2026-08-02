import { defaultSelected } from "./field-classes.js";
import { summarizeValue, type PlanOperation, type UpdateFieldClass, type UpdateMode, type UpdatePlanEntry, type UpdateScope } from "./schemas.js";

/** Working Update Plan row before public publication (concrete values stripped later). */
export type DraftPlanEntry = {
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
  beforeValue?: unknown;
  proposedValue?: unknown;
};

export type PushEntryInput = {
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

export function pushEntry(entries: DraftPlanEntry[], input: PushEntryInput): void {
  const selection = defaultSelected(input.fieldClass, input.operation, input.mode, {
    blankTarget: input.blankTarget,
    mutableFresh: input.mutableFresh,
    bound: input.bound,
    removalEligible: input.removalEligible,
    callerIsGm: input.callerIsGm,
  });
  const entry: DraftPlanEntry = {
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

export function optionalScope(scope: UpdateScope | undefined): Pick<PushEntryInput, "scope"> {
  return scope === undefined ? {} : { scope };
}

export function publishEntries(entries: readonly DraftPlanEntry[]): UpdatePlanEntry[] {
  return entries.map((entry) => ({
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
}
