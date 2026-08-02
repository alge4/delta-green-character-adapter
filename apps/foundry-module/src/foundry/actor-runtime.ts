import type { FoundryActorRuntime } from "../runtime.js";
import { isRecord } from "../paths.js";

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
      return actor.toObject(false);
    },
    captureRecoverySnapshot() {
      return actor.toObject(false);
    },
    verifyRecoverySnapshot(snapshot: unknown) {
      try {
        const roundTrip = JSON.parse(JSON.stringify(snapshot));
        return JSON.stringify(roundTrip) === JSON.stringify(snapshot);
      } catch {
        return false;
      }
    },
    async restoreFromSnapshot(snapshot: unknown) {
      if (!isRecord(snapshot)) {
        throw new Error("Recovery snapshot must be a plain object.");
      }
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      const current = actor.toObject(false);
      const currentItems = isRecord(current) && Array.isArray(current.items) ? current.items : [];
      const currentIds = currentItems
        .map((item) => (isRecord(item) && typeof item._id === "string" ? item._id : null))
        .filter((id): id is string => id !== null);
      if (currentIds.length > 0) {
        await actor.deleteEmbeddedDocuments("Item", currentIds);
      }
      const { items: _ignored, ...actorData } = snapshot;
      await actor.update(actorData as Record<string, unknown>, { diff: false, recursive: false });
      if (items.length > 0) {
        await actor.createEmbeddedDocuments("Item", items);
      }
    },
    async updateActor(diff: Record<string, unknown>) {
      await actor.update(diff);
    },
    async createEmbeddedItems(data: unknown[]) {
      const created = await actor.createEmbeddedDocuments("Item", data);
      return created.map((item) => item.id);
    },
    async deleteEmbeddedItems(ids: string[]) {
      await actor.deleteEmbeddedDocuments("Item", ids);
    },
    async updateEmbeddedItem(id: string, diff: Record<string, unknown>) {
      await actor.updateEmbeddedDocuments("Item", [{ _id: id, ...diff }]);
    },
  };
}
