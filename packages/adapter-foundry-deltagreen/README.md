# Foundry Delta Green codecs

`@delta-green-character-adapter/adapter-foundry-deltagreen` implements two directed capabilities against the pinned runtime tuple Foundry VTT `14.365` + Delta Green `1.7.0`:

- `Foundry Actor source JSON → canonical Agent Snapshot 1.0.0`
- `canonical Agent Snapshot 1.0.0 → create-new Foundry Actor source data`

Both directions are pure and serializable: no Foundry globals, no document mutation, and no world access. The export seam returns Actor create data for the caller to apply.

## Public seams

- **`importFoundryDeltaGreen`** — Actor JSON bytes/text → `AdapterOperationResult` carrying a canonical Agent Snapshot when import is safe (#25).
- **`exportFoundryDeltaGreen`** — canonical Agent Snapshot → `AdapterOperationResult` carrying `{ name, type, system, items, flags }` create data (#25).
- **`createFoundryDeltaGreenImportCapability` / `createFoundryDeltaGreenExportCapability`** — directed capability records that pass `validateCapabilityEvidence` against their inventory, known-loss manifest, and fixture checksums (#8, #23).
- **`canonicalSemanticView` / `foundrySemanticView`** — meaning-only projections used by the round-trip evidence.

Mapping inventories, known-loss manifests, and fixture plans live under `docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/` and `docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/`.

Excluded: Foundry API mutation and world writes, update policy selection and UI (#26), adjacent Foundry or Delta Green versions, and NPC or vehicle Actors.
