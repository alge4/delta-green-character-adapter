# Foundry Actor update planner

`@delta-green-character-adapter/foundry-update-planner` owns pure Actor Binding and immutable Merge / Replace / Synchronize Update Plans over a canonical Agent Snapshot and serializable Foundry Actor source (#7, #10, #26).

It emits data only: no Foundry globals, no document mutation, and no persistence or rollback. Apply and recovery live in `apps/foundry-module` (#27).

## Public seams

- **`planFoundryActorUpdate(snapshot, actorSource, options?)`** — returns an `AdapterOperationResult` whose `plan` is a Zod-validated immutable `UpdatePlan` with dependency-aware entries, target fingerprint, plan digest, scope completeness, and permission requirements.
- **`materializeSelectedPlanActions(snapshot, actorSource, plan, options?)`** — revalidates fingerprint/selection and returns concrete selected write actions for the Foundry apply runtime (#27). Public plan entries keep only safe summaries.
