import {
  cloneJson,
  deepEqual,
  deepMerge,
  expandUpdateDiff,
  isRecord,
  setByDotPath,
  type UnknownRecord,
} from "../src/paths.js";
import type { FoundryActorRuntime, FoundryWorldRuntime } from "../src/runtime.js";

export type FailureStage =
  | "beforeWrite"
  | "duringUpdate"
  | "duringCreateItem"
  | "duringDelete"
  | "duringRestore"
  | "verifyRecovery"
  | "afterWrite";

export type HarnessFailureInjection = {
  readonly stage: FailureStage;
  /** When true (default), the failure fires once then clears. */
  readonly once?: boolean;
};

export type InMemoryActorOptions = {
  readonly actorId?: string;
  readonly source: unknown;
  readonly canUpdate?: boolean;
  readonly gm?: boolean;
  readonly userId?: string;
  readonly injectFailure?: HarnessFailureInjection | readonly HarnessFailureInjection[];
};

export type InMemoryActorRuntime = FoundryActorRuntime & {
  writeCount: number;
  updateCalls: number;
  createItemCalls: number;
  deleteItemCalls: number;
  restoreCalls: number;
  setFailure(injection: HarnessFailureInjection | readonly HarnessFailureInjection[] | undefined): void;
  setCanUpdate(value: boolean): void;
  setGm(value: boolean): void;
};

function asFailureQueue(
  injection: HarnessFailureInjection | readonly HarnessFailureInjection[] | undefined,
): HarnessFailureInjection[] {
  if (injection === undefined) {
    return [];
  }
  if (
    typeof injection === "object" &&
    injection !== null &&
    "stage" in injection &&
    !Array.isArray(injection)
  ) {
    return [injection];
  }
  return [...injection];
}

/** Exact-target Foundry document stats stamped by the in-memory runtime (#29 F7). */
export const EXACT_TARGET_DOCUMENT_STATS = {
  coreVersion: "14.365",
  systemId: "deltagreen",
  systemVersion: "1.7.0",
  createdTime: 1_780_000_000_000,
  modifiedTime: 1_780_000_000_000,
  lastModifiedBy: "UserHarness0001",
  compendiumSource: null,
  duplicateSource: null,
  exportSource: null,
} as const;

function stampExactTargetStats(
  document: UnknownRecord,
  options: { readonly exportSource?: UnknownRecord | null } = {},
): void {
  const previous = isRecord(document._stats) ? document._stats : {};
  document._stats = {
    ...EXACT_TARGET_DOCUMENT_STATS,
    ...previous,
    coreVersion: EXACT_TARGET_DOCUMENT_STATS.coreVersion,
    systemId: EXACT_TARGET_DOCUMENT_STATS.systemId,
    systemVersion: EXACT_TARGET_DOCUMENT_STATS.systemVersion,
    ...(options.exportSource !== undefined ? { exportSource: options.exportSource } : {}),
  };
}

function ensureActorShape(
  source: unknown,
  actorId: string,
  options: { readonly assignDocumentId?: boolean; readonly stampStats?: boolean } = {},
): UnknownRecord {
  const copy = cloneJson(source);
  if (!isRecord(copy)) {
    throw new Error("Harness Actor source must be a plain object");
  }
  // Fingerprinting includes `_id`. Do not invent one for existing sources; only assign
  // on exact-runtime create where Foundry would mint a document id.
  if (options.assignDocumentId === true) {
    copy._id = actorId;
  }
  if (!Array.isArray(copy.items)) {
    copy.items = [];
  }
  if (!isRecord(copy.flags)) {
    copy.flags = {};
  }
  if (!isRecord(copy.system)) {
    copy.system = {};
  }
  if (options.stampStats !== false) {
    stampExactTargetStats(copy, {
      exportSource: {
        worldId: "dgca-exact-target-harness",
        uuid: `Actor.${actorId}`,
        coreVersion: EXACT_TARGET_DOCUMENT_STATS.coreVersion,
        systemId: EXACT_TARGET_DOCUMENT_STATS.systemId,
        systemVersion: EXACT_TARGET_DOCUMENT_STATS.systemVersion,
      },
    });
    const items = Array.isArray(copy.items) ? copy.items : [];
    copy.items = items.map((item) => {
      if (!isRecord(item)) {
        return item;
      }
      stampExactTargetStats(item);
      return item;
    });
  }
  return copy;
}

function nextItemId(counter: { value: number }): string {
  counter.value += 1;
  return `Item${counter.value.toString(16).padStart(12, "0")}`;
}

export function createInMemoryActorRuntime(options: InMemoryActorOptions): InMemoryActorRuntime {
  const actorId = options.actorId ?? (isRecord(options.source) && typeof options.source._id === "string"
    ? options.source._id
    : "ActorHarness0001");
  let source = ensureActorShape(options.source, actorId, {
    // Preserve pre-captured live fixtures' own _stats when replaying committed exports.
    stampStats: !isRecord(options.source) || options.source._stats === undefined,
  });
  let canUpdate = options.canUpdate !== false;
  let gm = options.gm === true;
  const userId = options.userId ?? "UserHarness0001";
  let failures = asFailureQueue(options.injectFailure);
  const itemIdCounter = { value: 0 };

  const runtime: InMemoryActorRuntime = {
    actorId,
    writeCount: 0,
    updateCalls: 0,
    createItemCalls: 0,
    deleteItemCalls: 0,
    restoreCalls: 0,
    setFailure(injection) {
      failures = asFailureQueue(injection);
    },
    setCanUpdate(value) {
      canUpdate = value;
    },
    setGm(value) {
      gm = value;
    },
    canUpdateActor() {
      return canUpdate;
    },
    isGm() {
      return gm;
    },
    currentUserId() {
      return userId;
    },
    readActorSource() {
      return cloneJson(source);
    },
    captureRecoverySnapshot() {
      return cloneJson(source);
    },
    verifyRecoverySnapshot(snapshot: unknown) {
      if (consumeFailure("verifyRecovery")) {
        return false;
      }
      try {
        const roundTrip = JSON.parse(JSON.stringify(snapshot));
        return deepEqual(roundTrip, snapshot);
      } catch {
        return false;
      }
    },
    async restoreFromSnapshot(snapshot: unknown) {
      runtime.restoreCalls += 1;
      if (consumeFailure("duringRestore")) {
        throw new Error("Injected failure: duringRestore");
      }
      // Preserve the verified recovery snapshot byte-for-byte, including Foundry _stats.
      source = ensureActorShape(snapshot, actorId, { stampStats: false });
    },
    async updateActor(diff: Record<string, unknown>) {
      maybeBeforeWrite();
      runtime.updateCalls += 1;
      if (consumeFailure("duringUpdate")) {
        throw new Error("Injected failure: duringUpdate");
      }
      const expanded = expandUpdateDiff(diff);
      const previousId = source._id;
      source = deepMerge(source, expanded) as UnknownRecord;
      if (typeof previousId === "string") {
        source._id = previousId;
      } else {
        delete source._id;
      }
      runtime.writeCount += 1;
      maybeAfterWrite();
    },
    async createEmbeddedItems(data: unknown[]) {
      maybeBeforeWrite();
      runtime.createItemCalls += 1;
      if (consumeFailure("duringCreateItem")) {
        throw new Error("Injected failure: duringCreateItem");
      }
      const ids: string[] = [];
      const items = Array.isArray(source.items) ? [...source.items] : [];
      for (const entry of data) {
        if (!isRecord(entry)) {
          continue;
        }
        const item = cloneJson(entry) as UnknownRecord;
        const id =
          typeof item._id === "string" && item._id !== "" ? item._id : nextItemId(itemIdCounter);
        item._id = id;
        ids.push(id);
        items.push(item);
      }
      source.items = items;
      runtime.writeCount += 1;
      maybeAfterWrite();
      return ids;
    },
    async deleteEmbeddedItems(ids: string[]) {
      maybeBeforeWrite();
      runtime.deleteItemCalls += 1;
      if (consumeFailure("duringDelete")) {
        throw new Error("Injected failure: duringDelete");
      }
      const remove = new Set(ids);
      const items = Array.isArray(source.items) ? source.items : [];
      source.items = items.filter(
        (entry) => !(isRecord(entry) && typeof entry._id === "string" && remove.has(entry._id)),
      );
      runtime.writeCount += 1;
      maybeAfterWrite();
    },
    async updateEmbeddedItem(id: string, diff: Record<string, unknown>) {
      maybeBeforeWrite();
      runtime.updateCalls += 1;
      if (consumeFailure("duringUpdate")) {
        throw new Error("Injected failure: duringUpdate");
      }
      const items = Array.isArray(source.items) ? [...source.items] : [];
      const index = items.findIndex((entry) => isRecord(entry) && entry._id === id);
      if (index < 0) {
        throw new Error(`Embedded Item not found: ${id}`);
      }
      const item = cloneJson(items[index]) as UnknownRecord;
      for (const [key, value] of Object.entries(diff)) {
        if (key.includes(".")) {
          setByDotPath(item, key, value);
        } else if (isRecord(value) && isRecord(item[key])) {
          item[key] = deepMerge(item[key] as UnknownRecord, value);
        } else {
          item[key] = value;
        }
      }
      item._id = id;
      items[index] = item;
      source.items = items;
      runtime.writeCount += 1;
      maybeAfterWrite();
    },
  };

  function consumeFailure(stage: FailureStage): boolean {
    const index = failures.findIndex((entry) => entry.stage === stage);
    if (index < 0) {
      return false;
    }
    const entry = failures[index]!;
    if (entry.once !== false) {
      failures.splice(index, 1);
    }
    return true;
  }

  function maybeBeforeWrite(): void {
    if (consumeFailure("beforeWrite")) {
      throw new Error("Injected failure: beforeWrite");
    }
  }

  function maybeAfterWrite(): void {
    if (consumeFailure("afterWrite")) {
      throw new Error("Injected failure: afterWrite");
    }
  }

  return runtime;
}

export type InMemoryWorldOptions = {
  readonly gm?: boolean;
  readonly userId?: string;
  readonly injectFailure?: HarnessFailureInjection;
};

export type InMemoryWorldRuntime = FoundryWorldRuntime & {
  readonly actors: Map<string, InMemoryActorRuntime>;
  createCount: number;
  setFailure(injection: HarnessFailureInjection | undefined): void;
  setGm(value: boolean): void;
};

export function createInMemoryWorld(options: InMemoryWorldOptions = {}): InMemoryWorldRuntime {
  const actors = new Map<string, InMemoryActorRuntime>();
  let gm = options.gm !== false;
  const userId = options.userId ?? "UserHarness0001";
  let failure = options.injectFailure;
  let createCounter = 0;

  const world: InMemoryWorldRuntime = {
    actors,
    createCount: 0,
    setFailure(injection) {
      failure = injection;
    },
    setGm(value) {
      gm = value;
    },
    isGm() {
      return gm;
    },
    currentUserId() {
      return userId;
    },
    async createActor(data: unknown) {
      world.createCount += 1;
      if (failure?.stage === "duringUpdate" || failure?.stage === "beforeWrite") {
        const once = failure.once !== false;
        if (once) {
          failure = undefined;
        }
        throw new Error("Injected failure: createActor");
      }
      createCounter += 1;
      const actorId = `Actor${createCounter.toString(16).padStart(12, "0")}`;
      const runtime = createInMemoryActorRuntime({
        actorId,
        source: ensureActorShape(data, actorId, { assignDocumentId: true }),
        gm,
        userId,
      });
      actors.set(actorId, runtime);
      return runtime;
    },
    async deleteActor(actorId: string) {
      actors.delete(actorId);
    },
  };

  return world;
}
