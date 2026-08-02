import { foundrySemanticView } from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { MaterializedApplyAction } from "@delta-green-character-adapter/foundry-update-planner";
import type { UpdatePlan } from "@delta-green-character-adapter/foundry-update-planner";

import { deepEqual, getByPointer, isRecord, parseItemPointer, type UnknownRecord } from "./paths.js";

const FOUNDRY_OWNED_DOCUMENT_KEYS = [
  "_id",
  "_stats",
  "folder",
  "ownership",
  "prototypeToken",
  "sort",
  "img",
  "effects",
] as const;

function itemById(actor: unknown, itemId: string): UnknownRecord | undefined {
  if (!isRecord(actor) || !Array.isArray(actor.items)) {
    return undefined;
  }
  for (const item of actor.items) {
    if (isRecord(item) && item._id === itemId) {
      return item;
    }
  }
  return undefined;
}

function selectedWritePaths(plan: UpdatePlan): Set<string> {
  const paths = new Set<string>();
  for (const entry of plan.entries) {
    if (
      entry.selectedByDefault &&
      entry.operation !== "preserve" &&
      entry.operation !== "add"
    ) {
      paths.add(entry.path);
    }
  }
  return paths;
}

function pathIsUnderSelected(path: string, selected: ReadonlySet<string>): boolean {
  if (selected.has(path)) {
    return true;
  }
  for (const selectedPath of selected) {
    if (path.startsWith(`${selectedPath}/`) || selectedPath.startsWith(`${path}/`)) {
      return true;
    }
  }
  return false;
}

/**
 * Post-apply semantic verification (#7/#27):
 * - Foundry-owned document keys unchanged vs pre-apply
 * - deselected / protected paths unchanged vs pre-apply baseline
 * - selected write actions reflected in the persisted source
 * - overall semantic view equals an in-memory expected projection when provided
 */
export function verifyAppliedActorState(input: {
  readonly preApplySource: unknown;
  readonly postApplySource: unknown;
  readonly plan: UpdatePlan;
  readonly actions: readonly MaterializedApplyAction[];
  readonly expectedSemantic?: unknown;
}): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const pre = input.preApplySource;
  const post = input.postApplySource;

  if (!isRecord(pre) || !isRecord(post)) {
    return { ok: false, reason: "Actor source must be a plain object for verification." };
  }

  for (const key of FOUNDRY_OWNED_DOCUMENT_KEYS) {
    if (!deepEqual(pre[key], post[key])) {
      return {
        ok: false,
        reason: `Foundry-owned document key "${key}" changed unexpectedly during apply.`,
      };
    }
  }

  const selected = selectedWritePaths(input.plan);

  for (const entry of input.plan.entries) {
    if (entry.selectedByDefault && entry.operation !== "preserve") {
      continue;
    }
    if (entry.operation === "add" || entry.path === "/items") {
      continue;
    }
    if (pathIsUnderSelected(entry.path, selected)) {
      continue;
    }
    const before = getByPointer(pre, entry.path);
    const after = getByPointer(post, entry.path);
    if (!deepEqual(before, after)) {
      return {
        ok: false,
        reason: `Protected or deselected path ${entry.path} changed during apply.`,
      };
    }
  }

  for (const action of input.actions) {
    if (action.operation === "remove") {
      const { itemId } = parseItemPointer(action.path);
      if (itemById(post, itemId) !== undefined) {
        return { ok: false, reason: `Remove of item ${itemId} was not persisted.` };
      }
      continue;
    }

    if (action.operation === "add") {
      if (!isRecord(action.value)) {
        continue;
      }
      const name = typeof action.value.name === "string" ? action.value.name : undefined;
      const type = typeof action.value.type === "string" ? action.value.type : undefined;
      if (name === undefined || type === undefined) {
        continue;
      }
      const items = Array.isArray(post.items) ? post.items : [];
      const found = items.some(
        (item) => isRecord(item) && item.name === name && item.type === type,
      );
      if (!found) {
        return {
          ok: false,
          reason: `Add of ${type} "${name}" was not reflected in persisted items.`,
        };
      }
      continue;
    }

    if (action.path === "/items") {
      continue;
    }

    const after = getByPointer(post, action.path);
    if (!deepEqual(after, action.value)) {
      return {
        ok: false,
        reason: `Selected ${action.operation} at ${action.path} was not reflected after apply.`,
      };
    }
  }

  if (input.expectedSemantic !== undefined) {
    const actual = foundrySemanticView(post);
    if (!deepEqual(actual, input.expectedSemantic)) {
      return {
        ok: false,
        reason: "Post-apply foundrySemanticView diverged from the expected semantic projection.",
      };
    }
  }

  // Baseline: unselected semantic meaning must not diverge from pre-apply when no expected view.
  if (input.expectedSemantic === undefined && input.actions.length === 0) {
    if (!deepEqual(foundrySemanticView(pre), foundrySemanticView(post))) {
      return {
        ok: false,
        reason: "No-op apply changed semantic Actor meaning.",
      };
    }
  }

  return { ok: true };
}
