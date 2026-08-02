/**
 * Injectable exact-runtime ports for Foundry Actor apply/create (#27).
 * Implementations wrap live Foundry documents; tests use the in-memory harness.
 */

export type FoundryActorRuntime = {
  readonly actorId: string;
  canUpdateActor(): boolean;
  isGm(): boolean;
  currentUserId(): string;
  /** Serializable Actor source equivalent to document.toObject(false) / export JSON. */
  readActorSource(): unknown;
  /** Capture a complete restorable snapshot of Actor + embedded Items. */
  captureRecoverySnapshot(): unknown;
  /** Verify snapshot can be serialized/restored (round-trip JSON). */
  verifyRecoverySnapshot(snapshot: unknown): boolean;
  restoreFromSnapshot(snapshot: unknown): Promise<void>;
  updateActor(diff: Record<string, unknown>): Promise<void>;
  /** Returns new embedded Item ids in creation order. */
  createEmbeddedItems(data: unknown[]): Promise<string[]>;
  deleteEmbeddedItems(ids: string[]): Promise<void>;
  updateEmbeddedItem(id: string, diff: Record<string, unknown>): Promise<void>;
};

export type FoundryWorldRuntime = {
  isGm(): boolean;
  currentUserId(): string;
  createActor(data: unknown): Promise<FoundryActorRuntime>;
  /** Best-effort cleanup after a partial create failure. */
  deleteActor?(actorId: string): Promise<void>;
};
