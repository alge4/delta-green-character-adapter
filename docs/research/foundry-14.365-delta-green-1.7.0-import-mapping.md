# Foundry `14.365` + Delta Green `1.7.0` → canonical Agent `1.0.0` import mapping

## Decision summary

This document records the directional import mapping for the capability:

`Foundry VTT 14.365 + Delta Green 1.7.0 Agent Actor export → canonical Agent schema 1.0.0`

It adopts persisted-path dispositions from [`foundry-14.365-delta-green-1.7.0-contract.md`](./foundry-14.365-delta-green-1.7.0-contract.md) (issue #4), the fidelity rules from issue #8, and the grilling decisions on issue #18. Canonical is the interchange hub: every representable Agent fact lands in real canonical fields so a later adapter (for example Green Agent Creator) can consume them without reading Foundry extensions.

Machine-readable companions live at:

- [`docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/inventory.json`](../mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/inventory.json)
- [`docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/known-loss.json`](../mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/known-loss.json)
- [`docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/fixture-plan.md`](../mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/fixture-plan.md)

The reverse capability is specified separately in [`foundry-14.365-delta-green-1.7.0-export-mapping.md`](./foundry-14.365-delta-green-1.7.0-export-mapping.md). Existing-Actor merge selection defaults remain issues #7/#10. Adapter package implementation is deferred to issue #19.

## Capability identity

| Field | Value |
|---|---|
| Direction | import |
| Source format | `foundry-deltagreen` |
| Source version pin | `14.365+1.7.0` (system commit `7d86f90e1d25d47a316b94e072b14a34ca80366b`) |
| Target | canonical Agent schema `1.0.0` |
| Adapter id | `foundry-deltagreen-import` |
| Fidelity class | lossy semantic (enumerated losses in `known-loss.json`) |

Provenance written on every successful import:

- `provenance.source.format` = `"foundry-deltagreen"`
- `provenance.source.version` = `"14.365+1.7.0"`
- `provenance.source.recordId` = Actor `_id` when present
- `provenance.adapter.id` = `"foundry-deltagreen-import"`
- `provenance.adapter.version` = adapter package semver at runtime (`0.0.0` in pre-package fixtures)
- `provenance.contentHash` = `sha256:` + lowercase hex of the raw Actor export JSON bytes as imported
- `provenance.capturedAt` = optional ISO instant when known
- `agentId` = existing `flags.deltaGreenCharacterAdapter.agentId` when a valid lowercase UUID v4; otherwise a newly generated UUID v4 (never derived from Actor `_id` or name)

Warn when runtime or `_stats` evidence is not the exact tuple; legacy pregen `_stats` must not silently pass as exact-target proof.

## Extension and flag namespaces

Canonical meaning first. Residual non-semantic Foundry data only:

| Key | Contents |
|---|---|
| `extensions.foundry.identity` | Actor/Item `_id`s, typed-skill keys (`tskill_01`), special-training `id`s, system AutoAdded markers for correlation |
| `extensions.foundry.sheet` | `system.schemaVersion`, `system.settings.*`, resource `min`, `system.physical.exhaustedPenalty` |
| `extensions.foundry.raw` | Unknown persisted paths, malformed-but-kept values, non-digit age text, formula-disagreeing persisted maxima |

On read, `flags.deltaGreenCharacterAdapter.unrepresentable.*` feeds canonical fields (for example `dateOfBirth`, `aliases`) so Foundry → canonical → other adapters keeps them. Foundry-owned world metadata (`folder`, `ownership`, `prototypeToken`, `effects`, non-adapter flags) is not carried into canonical.

## Global transform rules

1. **Block** when the root is not an object; `type` is present and not `agent`; `system` is missing/non-object; any of the six statistics is missing, non-numeric, or non-finite; or `_stats.systemId` is present and not `deltagreen`.
2. **Read source data**, not prepared projections. Ignore prepared-only values listed in the contract (`statistics.*.x5`, `skills.*.targetProficiency`, `sanity.max`, `sanity.adaptations.*.isAdapted`, etc.) even if legacy exports contain them.
3. **Explicit values win.** Zero is explicit. Calculate only absent/null derived maxima. Warn on formula mismatch; never silently clamp or replace explicit in-range currents.
4. **Unknown persisted paths** → `extensions.foundry.raw` with a path-specific warning unless import is unsafe.
5. **HTML** system narrative fields become `{ format: "html", content }` when non-empty.

## Destination mapping (summary)

Exact path rows are in `inventory.json`.

### Identity and biography

| Source | Canonical | Notes |
|---|---|---|
| `name` | `identity.name` | Exact text when non-empty |
| `flags…unrepresentable.aliases` | `identity.aliases` | When present |
| `system.biography.*` | matching biography fields | Age: digit-only → int; other text → omit + raw + warn |
| `flags…unrepresentable.dateOfBirth` | `biography.dateOfBirth` | ISO `YYYY-MM-DD` only |
| `system.physical.description` | `biography.physicalDescription` | HTML narrative |

### Statistics and resources

| Source | Canonical |
|---|---|
| `system.statistics.{str…cha}.value` | `statistics.{strength…charisma}.score` |
| `system.statistics.*.distinguishing_feature` | matching `distinguishingFeature` |
| HP/WP `value` | `resources.*.current` |
| HP/WP maxima | formula from stats; persisted `max` disagreement → warn + raw |
| SAN / BP | sentinel rules in inventory (`>=100` SAN, `101` BP); see known-loss for SAN ≥ 100 |
| wounds / exhausted / firstAidAttempted | matching resources fields |

### Skills

- Fixed standard-skill table including **`heavy_machiner` ↔ `heavyMachinery`**.
- Foundry `system.skills.unarmed_combat` → `skills.custom` (no canonical standard id) — known loss.
- Typed skills → `skills.custom[]` with handbook family groups (`art`, `craft`, `foreign_language`, `military_science`, `pilot`, `science`) and user-typed specialization labels.
- Special training → `skills.specialTraining[]`; Foundry `id` is correlation only.

### Psychology, relationships, inventory

- Bonds / weapons / armor / gear / tomes / rituals map by Item `type`.
- Motivation Items split into motivations + optional linked disorders.
- Adaptations: violence/helplessness rows with exact `incidentMarks` counts; `adapted` derived when marks === 3.
- System-owned Unarmed Attack maps as a normal weapon and records AutoAdded identity for rematch.
- Tome/ritual Handler notes stay on those entries (`handlerNotes` / `revealed`), not `notes.handler`.
- General Agent `notes.player` / `notes.handler` stay empty (no DG 1.7.0 Agent notes field).

### Campaign state

`system.corruption.*` → `campaignState.impossibleLandscapes` when any non-default value is present.

## Known losses

See `known-loss.json`. Principal losses: Unarmed Combat skill demotion; SAN ≥ 100 cannot be distinguished from the init sentinel; Breaking Point baseline not persisted by Foundry; no general notes; `other` adaptations absent; Foundry-only weapon fields (`isLethal`, `customSkillTarget`) retained only in extensions.

## Fixture plan

See `fixture-plan.md`. The blank live export is already SHA-pinned in the contract. A populated live export plus TypeDataModel-derived synthetics are required before full coverage claims.

## Out of scope

- Canonical → Foundry export (separate capability doc)
- Existing-Actor Update Plan selection UX (issues #7/#10/#9)
- NPC/vehicle Actor types
- Historical/future Foundry or system versions
- Adapter package implementation (#19)
