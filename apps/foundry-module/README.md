# Foundry module apply bridge and Agent-sheet import wizard

`@delta-green-character-adapter/foundry-module` is the exact-runtime Foundry bridge and Agent-sheet UI for the initial Green → Foundry tracer bullet (#9, #27, #28).

It owns permission and fingerprint revalidation, verified restorable snapshots, deterministic Actor/Item batches, rollback, post-apply semantic verification, compact audit/binding flags, and the Variant A title-bar Completeness Assessment lamp plus modal import wizard. Mapping and planning stay in packages.

## Public seams

- **`applyFoundryActorUpdate({ plan, snapshot, runtime, options? })`** — materializes selected plan actions against a live `FoundryActorRuntime`, mutates only after a verified recovery snapshot, verifies semantic results, writes compact audit flags on success, and rolls back on failure.
- **`createFoundryActor({ snapshot, world, options? })`** — exact-runtime create via `exportFoundryDeltaGreen` and `FoundryWorldRuntime.createActor`, then compact audit/binding flags.
- **`createImportWizardSession({ runtime, sheet, options? })`** — deep controller for local Green `5c9e92d` JSON → diagnostics/remediation → Update Plan review → verified apply.
- **`mountImportWizardUi({ host, titleBar, modalHost, bioHost? })`** — Variant A DOM chrome (title-bar lamp + Import, modal wizard, module-owned Bio fields).
- **`registerFoundryModule({ hooks, getGame })`** — attaches chrome to supported Delta Green Agent sheets only; does not alter upstream tabs or system schema.
- **`FoundryActorRuntime` / `FoundryWorldRuntime`** — injectable ports (no Foundry globals in core apply logic).
- **In-memory harness** (`test/harness.ts`) — failure-injection Actor/world store for vertical acceptance tests.
- **Browser harness** (`browser/`, `pnpm test:browser`) — Playwright flows for Caleb blank import and populated mutable-preserving merge.
- **Production artifact** (`pnpm build` → `artifact/delta-green-character-adapter/`) — Foundry `module.json` plus bundled `main.js`, styles, and README only; exact Foundry `14.365` / Delta Green `1.7.0` compatibility and the three verified capability ids are embedded in manifest flags. After build, `scripts/assert-packaged-artifact.mjs` proves MANIFEST/production-file/bootstrap agreement and runs the ApplicationV2 mount gate (`scripts/diagnose-sheet-mount.mjs`).

## Constraints

- First import source is local Green Agent Creator `5c9e92d` JSON only (no upload, no Green export, spreadsheet, PDF, NPC, vehicle, monitoring, or reusable-mapping affordances).
- Unsupported canonical Bio fields (for example date of birth) live under `flags.deltaGreenCharacterAdapter.unrepresentable` and surface in Bio without changing upstream schema.
- Recovery snapshots are never persisted in module flags. Incomplete rollback exposes an in-memory recovery snapshot for authorized manual restore only.
- Handler-only selected work requires a GM; non-GMs do not see Handler-only plan values.
