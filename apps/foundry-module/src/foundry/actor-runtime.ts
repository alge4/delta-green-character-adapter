import type { FoundryActorRuntime } from "../runtime.js";
import { cloneJson, deepEqual, isRecord } from "../paths.js";

/**
 * Minimal structural type for a live Foundry Actor document.
 * Keeps Foundry globals out of the package compile graph.
 */
export type FoundryActorDocument = {
  readonly id: string;
  readonly type: string;
  readonly isOwner: boolean;
  toObject(source?: boolean): unknown;
  update(data: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  createEmbeddedDocuments(
    embeddedName: string,
    data: unknown[],
    options?: Record<string, unknown>,
  ): Promise<Array<{ id: string }>>;
  deleteEmbeddedDocuments(
    embeddedName: string,
    ids: string[],
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  updateEmbeddedDocuments(
    embeddedName: string,
    updates: Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
};

export type FoundryUserLike = {
  readonly id: string;
  readonly isGM: boolean;
};

/**
 * Wrap a live Foundry Actor as the injectable apply/create port (#27/#28).
 */
export function createFoundryActorRuntime(input: {
  readonly actor: FoundryActorDocument;
  readonly user: FoundryUserLike;
}): FoundryActorRuntime {
  const { actor, user } = input;
  return {
    actorId: actor.id,
    canUpdateActor() {
      return actor.isOwner;
    },
    isGm() {
      return user.isGM;
    },
    currentUserId() {
      return user.id;
    },
    readActorSource() {
      // Foundry enriched docs can contain class instances (e.g. Color on token tint).
      // Always expose plain JSON so planner/verify/Zod operation results stay valid (#40).
      return cloneJson(actor.toObject(false));
    },
    captureRecoverySnapshot() {
      return cloneJson(actor.toObject(false));
    },
    verifyRecoverySnapshot(snapshot: unknown) {
      try {
        const plain = cloneJson(snapshot);
        // Reject snapshots that are not plain JSON documents (Foundry Color, etc.).
        return isRecord(plain) && deepEqual(plain, snapshot);
      } catch {
        return false;
      }
    },
    async restoreFromSnapshot(snapshot: unknown) {
      const plain = cloneJson(snapshot);
      if (!isRecord(plain)) {
        throw new Error("Recovery snapshot must be a plain object.");
      }
      const items = Array.isArray(plain.items) ? plain.items : [];
      const current = cloneJson(actor.toObject(false));
      const currentItems = isRecord(current) && Array.isArray(current.items) ? current.items : [];
      const currentIds = currentItems
        .map((item) => (isRecord(item) && typeof item._id === "string" ? item._id : null))
        .filter((id): id is string => id !== null);
      if (currentIds.length > 0) {
        await actor.deleteEmbeddedDocuments("Item", currentIds);
      }
      const { items: _ignored, ...actorData } = plain;
      await actor.update(actorData as Record<string, unknown>, { diff: false, recursive: false });
      if (items.length > 0) {
        await actor.createEmbeddedDocuments("Item", items);
      }
    },
    async updateActor(diff: Record<string, unknown>) {
      // Zod-frozen nested values are not safe for Foundry DataModel merges (#40).
      await actor.update(cloneJson(diff));
    },
    async createEmbeddedItems(data: unknown[]) {
      // Materialized add payloads can be Zod-frozen; Foundry HTMLField assigns into
      // `system.description` and throws on read-only properties (#40).
      // Also trim names: Foundry Document creation strips trailing whitespace.
      const plain = data.map((entry) => {
        const copy = cloneJson(entry);
        if (isRecord(copy) && typeof copy.name === "string") {
          copy.name = copy.name.trim();
        }
        return copy;
      });
      const created = await actor.createEmbeddedDocuments("Item", plain);
      return created.map((item) => item.id);
    },
    async deleteEmbeddedItems(ids: string[]) {
      await actor.deleteEmbeddedDocuments("Item", ids);
    },
    async updateEmbeddedItem(id: string, diff: Record<string, unknown>) {
      await actor.updateEmbeddedDocuments("Item", [{ _id: id, ...cloneJson(diff) }]);
    },
  };
}
