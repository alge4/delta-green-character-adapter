import type { FoundryActorRuntime } from "./runtime.js";
import { cloneJson, deepEqual } from "./paths.js";

/**
 * Capture and verify a restorable Actor snapshot before mutation (#7/#10/#27).
 * Snapshots stay in-memory only — never written to module flags.
 */
export function captureVerifiedRecoverySnapshot(runtime: FoundryActorRuntime): {
  readonly ok: true;
  readonly snapshot: unknown;
} | {
  readonly ok: false;
  readonly reason: string;
} {
  let snapshot: unknown;
  try {
    snapshot = runtime.captureRecoverySnapshot();
  } catch (error) {
    return {
      ok: false,
      reason: `Recovery snapshot capture failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let verified = false;
  try {
    verified = runtime.verifyRecoverySnapshot(snapshot);
  } catch (error) {
    return {
      ok: false,
      reason: `Recovery snapshot verification threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!verified) {
    return { ok: false, reason: "Recovery snapshot failed serialization/restore verification." };
  }

  return { ok: true, snapshot };
}

export async function restoreAndVerify(
  runtime: FoundryActorRuntime,
  snapshot: unknown,
  preApplySource: unknown,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  try {
    await runtime.restoreFromSnapshot(snapshot);
  } catch (error) {
    return {
      ok: false,
      reason: `Rollback restore failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const restored = runtime.readActorSource();
  if (!deepEqual(cloneJson(restored), cloneJson(preApplySource))) {
    return {
      ok: false,
      reason: "Rollback restore completed but Actor source does not match the pre-apply baseline.",
    };
  }

  return { ok: true };
}
