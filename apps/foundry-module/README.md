# Foundry module apply/recovery bridge

`@delta-green-character-adapter/foundry-module` is a thin exact-runtime bridge that applies a validated Update Plan to a Foundry Actor (#7, #10, #27).

It owns permission and fingerprint revalidation, verified restorable snapshots, deterministic Actor/Item batches, rollback, post-apply semantic verification, and compact audit/binding flags. Mapping and planning stay in packages; the Foundry UI is separate (#28).

## Public seams

- **`applyFoundryActorUpdate({ plan, snapshot, runtime, options? })`** — materializes selected plan actions against a live `FoundryActorRuntime`, mutates only after a verified recovery snapshot, verifies semantic results, writes compact audit flags on success, and rolls back on failure.
- **`createFoundryActor({ snapshot, world, options? })`** — exact-runtime create via `exportFoundryDeltaGreen` and `FoundryWorldRuntime.createActor`, then compact audit/binding flags.
- **`FoundryActorRuntime` / `FoundryWorldRuntime`** — injectable ports (no Foundry globals in this package).
- **In-memory harness** (`test/harness.ts`) — failure-injection Actor/world store for vertical acceptance tests.

Recovery snapshots are never persisted in module flags. Incomplete rollback exposes an in-memory recovery snapshot on the operation result (and via `onManualRecovery`) for authorized manual restore only. The bridge does not elevate permissions; Handler-only selected work requires a GM.
