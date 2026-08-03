import type { MaterializedApplyAction } from "@delta-green-character-adapter/foundry-update-planner";

import {
  cloneJson,
  deepMerge,
  expandUpdateDiff,
  isRecord,
  normalizeFoundryWriteValue,
  parseItemPointer,
  pointerToActorUpdateKey,
  setByDotPath,
  type UnknownRecord,
} from "./paths.js";
import type { FoundryActorRuntime } from "./runtime.js";

/** Foundry trims Document names and StringField values; keep planned writes aligned. */
export function normalizeItemCreateData(entry: unknown): unknown {
  return normalizeFoundryWriteValue(cloneJson(entry));
}

function normalizeDiff(diff: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(diff)) {
    out[key] = normalizeFoundryWriteValue(value);
  }
  return out;
}

export type PreparedApplyBatches = {
  readonly actorDiff: Record<string, unknown>;
  readonly clearDiff: Record<string, unknown>;
  readonly itemUpdates: ReadonlyArray<{ readonly id: string; readonly diff: Record<string, unknown> }>;
  readonly itemClears: ReadonlyArray<{ readonly id: string; readonly diff: Record<string, unknown> }>;
  readonly additions: readonly unknown[];
  readonly removals: readonly string[];
};

/**
 * Partition ordered materialized actions into Actor/Item mutation batches.
 * Clears and removals are kept separate so they can run after midpoint verify (#10).
 */
export function prepareApplyBatches(
  actions: readonly MaterializedApplyAction[],
): PreparedApplyBatches {
  const actorDiff: Record<string, unknown> = {};
  const clearDiff: Record<string, unknown> = {};
  const itemDiffById = new Map<string, Record<string, unknown>>();
  const itemClearById = new Map<string, Record<string, unknown>>();
  const additions: unknown[] = [];
  const removals: string[] = [];

  for (const action of actions) {
    if (action.operation === "add") {
      additions.push(action.value);
      continue;
    }

    if (action.operation === "remove") {
      const { itemId } = parseItemPointer(action.path);
      removals.push(itemId);
      continue;
    }

    if (action.path === "/items" || action.path.startsWith("/items/")) {
      const parsed = parseItemPointer(action.path);
      if (parsed.relativeKey === undefined) {
        continue;
      }
      const target = action.operation === "clear" ? itemClearById : itemDiffById;
      const existing = target.get(parsed.itemId) ?? {};
      existing[parsed.relativeKey] = action.value;
      target.set(parsed.itemId, existing);
      continue;
    }

    const key = pointerToActorUpdateKey(action.path);
    if (action.operation === "clear") {
      clearDiff[key] = action.value;
    } else {
      actorDiff[key] = action.value;
    }
  }

  return {
    actorDiff,
    clearDiff,
    itemUpdates: [...itemDiffById.entries()].map(([id, diff]) => ({ id, diff })),
    itemClears: [...itemClearById.entries()].map(([id, diff]) => ({ id, diff })),
    additions,
    removals,
  };
}

/**
 * Execute prepared batches against the runtime.
 * Order (#10): bind/add/update → optional midpoint verify → clear/delete last.
 */
export async function executeApplyBatches(
  runtime: FoundryActorRuntime,
  batches: PreparedApplyBatches,
  options?: {
    readonly beforeDestructive?: () => Promise<void> | void;
  },
): Promise<void> {
  if (Object.keys(batches.actorDiff).length > 0) {
    await runtime.updateActor(normalizeDiff(batches.actorDiff));
  }

  if (batches.additions.length > 0) {
    // Plain JSON copies: Zod-frozen add payloads break Foundry Item DataModels (#40).
    // Trim strings — Foundry StringField/Document names strip whitespace on write.
    await runtime.createEmbeddedItems(batches.additions.map((entry) => normalizeItemCreateData(entry)));
  }

  for (const update of batches.itemUpdates) {
    await runtime.updateEmbeddedItem(update.id, normalizeDiff(update.diff));
  }

  const hasDestructive =
    batches.removals.length > 0 ||
    Object.keys(batches.clearDiff).length > 0 ||
    batches.itemClears.length > 0;
  if (hasDestructive && options?.beforeDestructive !== undefined) {
    await options.beforeDestructive();
  }

  if (Object.keys(batches.clearDiff).length > 0) {
    await runtime.updateActor(normalizeDiff(batches.clearDiff));
  }

  for (const clear of batches.itemClears) {
    await runtime.updateEmbeddedItem(clear.id, normalizeDiff(clear.diff));
  }

  if (batches.removals.length > 0) {
    await runtime.deleteEmbeddedItems([...batches.removals]);
  }
}

/** Apply the same batches to an in-memory Actor source clone for expected-state verification. */
export function applyBatchesToSourceClone(
  source: unknown,
  batches: PreparedApplyBatches,
  createItemId: () => string = () => `item${Math.random().toString(36).slice(2, 10)}`,
): unknown {
  const actor = cloneJson(source);
  if (!isRecord(actor)) {
    return actor;
  }

  if (Object.keys(batches.actorDiff).length > 0) {
    const expanded = expandUpdateDiff(normalizeDiff(batches.actorDiff));
    Object.assign(actor, deepMerge(actor, expanded));
  }

  if (!Array.isArray(actor.items)) {
    actor.items = [];
  }
  const items = actor.items as unknown[];

  for (const addition of batches.additions) {
    if (!isRecord(addition)) {
      continue;
    }
    const copy = normalizeItemCreateData(addition) as UnknownRecord;
    if (typeof copy._id !== "string" || copy._id === "") {
      copy._id = createItemId();
    }
    items.push(copy);
  }

  for (const update of batches.itemUpdates) {
    const item = items.find((entry) => isRecord(entry) && entry._id === update.id);
    if (!isRecord(item)) {
      continue;
    }
    for (const [key, value] of Object.entries(normalizeDiff(update.diff))) {
      setByDotPath(item, key, value);
    }
  }

  if (Object.keys(batches.clearDiff).length > 0) {
    Object.assign(actor, deepMerge(actor, expandUpdateDiff(normalizeDiff(batches.clearDiff))));
  }

  for (const clear of batches.itemClears) {
    const item = items.find((entry) => isRecord(entry) && entry._id === clear.id);
    if (!isRecord(item)) {
      continue;
    }
    for (const [key, value] of Object.entries(normalizeDiff(clear.diff))) {
      setByDotPath(item, key, value);
    }
  }

  if (batches.removals.length > 0) {
    const remove = new Set(batches.removals);
    actor.items = items.filter(
      (entry) => !(isRecord(entry) && typeof entry._id === "string" && remove.has(entry._id)),
    );
  }

  return actor;
}
