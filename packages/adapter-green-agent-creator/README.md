# Green Agent Creator import adapter

`@delta-green-character-adapter/adapter-green-agent-creator` implements the directed capability:

`Green Agent Creator 5c9e92d raw Agent JSON → canonical Agent Snapshot 1.0.0`

## Public seams

- **`importGreenAgentCreator`** — raw JSON bytes/text → `AdapterOperationResult` with a canonical Agent Snapshot when import is safe (#17, #24).
- **Capability evidence** — exact directed capability record plus inventory/known-loss/fixture agreement via `validateCapabilityEvidence` (#8, #23).

Mapping inventory, known-loss, and fixture plan live under `docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/`.

Excluded: canonical→Green export, browser storage acquisition, scraping, reusable mappings, spreadsheet/PDF, and UI.
