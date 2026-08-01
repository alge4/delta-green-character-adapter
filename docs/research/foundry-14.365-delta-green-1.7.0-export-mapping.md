# Canonical Agent `1.0.0` → Foundry `14.365` + Delta Green `1.7.0` export mapping

## Decision summary

This document records the directional export mapping for the capability:

`canonical Agent schema 1.0.0 → Foundry VTT 14.365 + Delta Green 1.7.0 Agent Actor`

It is the reverse companion to [`foundry-14.365-delta-green-1.7.0-import-mapping.md`](./foundry-14.365-delta-green-1.7.0-import-mapping.md). Inventories are directional and may differ (issue #8). Create-new Actor construction uses this inventory; existing-Actor merge reuses the same canonical→persisted paths under the Update Plan selection rules from issues #7 and #10.

Machine-readable companions live at:

- [`docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/inventory.json`](../mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/inventory.json)
- [`docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/known-loss.json`](../mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/known-loss.json)
- [`docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/fixture-plan.md`](../mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/fixture-plan.md)

Adapter package implementation is deferred to issue #19.

## Capability identity

| Field | Value |
|---|---|
| Direction | export |
| Source | canonical Agent schema `1.0.0` |
| Target format | `foundry-deltagreen` |
| Target version pin | `14.365+1.7.0` |
| Adapter id | `foundry-deltagreen-export` |
| Fidelity class | lossy semantic (enumerated losses in `known-loss.json`) |

This capability consumes a canonical snapshot; it does not invent a new one. On successful create or merge apply, Actor audit/binding flags record capability id, adapter version, source content hash, plan digest, and `agentId` per issue #7.

## On-Actor flag namespace

`flags.deltaGreenCharacterAdapter`:

| Key | Purpose |
|---|---|
| `agentId` | Canonical identity binding |
| `bindings` | Canonical entry id ↔ Foundry Item / typedSkills / specialTraining keys |
| `unrepresentable.dateOfBirth` | Canonical DOB (no system field) |
| `unrepresentable.aliases` | Canonical aliases |
| `unrepresentable.breakingPointBaseline` | Canonical BP baseline when it must be retained |
| `unrepresentable.notes` | Optional parking for `notes.player` / `notes.handler` when no system field exists |
| audit fields | Compact apply audit from #7 (no raw source, no secrets) |

Never modify `flags.deltagreen.*` system markers except by leaving AutoAdded Unarmed Attack intact.

## Global transform rules

1. **Create-new** output shape is `{ name, type: "agent", system, items }` plus adapter flags. Omit `_id` / `_stats` / ownership / folder / token and let Foundry and the system initialize defaults (including linked prototype token and Unarmed Attack auto-add).
2. **Do not write prepared projections** as authoritative fields.
3. **Explicit canonical values win** on create. On merge, profile/capability updates default on; mutable campaign state preserves unless selected (#7); Replace/Synchronize follow #10.
4. **HTML**: write `format: "html"` content as-is (sanitized for Foundry). Plain/markdown is escaped or conservatively converted; record an info diagnostic on conversion.
5. **Unarmed Attack**: after create, bind/update the system AutoAdded weapon from canonical when a matching weapon exists; never duplicate it.
6. **Sheet settings**: on create, leave system defaults (or restore from `extensions.foundry.sheet` only when present and targeting the same Foundry edge). On merge, preserve existing settings unless an explicit plan entry says otherwise.

## Destination mapping (summary)

Exact path rows are in `inventory.json`.

### Identity and biography

| Canonical | Foundry |
|---|---|
| `identity.name` | `name` |
| `identity.aliases` | `flags…unrepresentable.aliases` |
| `biography.*` (except DOB) | `system.biography.*` (age as digit string) |
| `biography.dateOfBirth` | `flags…unrepresentable.dateOfBirth` |
| `biography.physicalDescription` | `system.physical.description` (HTML) |

### Statistics and resources

| Canonical | Foundry |
|---|---|
| `statistics.*.score` | `system.statistics.<stat>.value` |
| `distinguishingFeature` | `distinguishing_feature` |
| resource currents | `health.value` / `wp.value` / `sanity.value` |
| maxima | formula-consistent persisted max; system will re-prepare |
| SAN ≥ 100 | warn; write POW×5 (cannot survive prepare) |
| BP current / baseline | `currentBreakingPoint` + flag baseline |
| wounds / exhausted / firstAid | matching `system.physical.*` |

### Skills

- Reverse of the import `skillKeyMap`, including **`heavyMachinery` → `heavy_machiner`**.
- Handbook typed customs → `typedSkills` with bound or new `tskill_NN` keys.
- Custom `group: "unarmed_combat"` → `system.skills.unarmed_combat` (Foundry standard key) when exporting back to Foundry.
- Other customs → typedSkills (family group) or warn + typedSkills with best-effort group.
- Special training array ↔ `system.specialTraining[]`.

### Collections

- Bonds, weapons, armor, gear, tomes, rituals → embedded Items by type.
- Motivations + linked disorders → motivation Items; unlinked disorders → motivation Item with disorder fields filled and statement from disorder name (normalization diagnostic).
- Adaptations → incident bits; `kind: other` → flags/unrepresentable or extension only + warn.
- `campaignState.impossibleLandscapes` → `system.corruption.*`.
- `notes.*` → `flags…unrepresentable.notes` (no Agent notes field).

## Relationship to merge modes

| Mode | Uses this inventory for | Selection defaults |
|---|---|---|
| Create-new | Full Actor construction | All mapped fields written |
| Merge (#7) | Proposed path updates | Profile on; mutable off; Foundry-owned untouched |
| Replace / Synchronize (#10) | Same paths + scoped removals | Completeness-gated; Unarmed Attack protected |

## Known losses

See `known-loss.json`. Principal losses: DOB/aliases/notes/BP baseline only in flags; SAN ≥ 100; `other` adaptations; markdown→HTML conversion; Foundry-only weapon fields regenerated or dropped.

## Fixture plan

See `fixture-plan.md`. Round-trip tests are semantic and directional; Foundry→canonical→Foundry does not prove GAC cycles (#8).

## Out of scope

- Foundry → canonical import (separate capability)
- NPC/vehicle types
- Historical/future runtime versions
- Adapter package implementation (#19)
