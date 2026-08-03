# Green Agent Creator `5c9e92d` → canonical Agent `1.0.0` import mapping

## Decision summary

This document records the directional import mapping for the capability:

`Green Agent Creator commit 5c9e92d raw Agent JSON → canonical Agent schema 1.0.0`

It adopts the source-path dispositions from [`green-agent-creator-5c9e92d-contract.md`](./green-agent-creator-5c9e92d-contract.md) (issue #3) and pins exact canonical destinations, extension partitions, provenance strings, known losses, and the golden-fixture plan required by issue #8.

Machine-readable companions live at:

- [`docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/inventory.json`](../mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/inventory.json)
- [`docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/known-loss.json`](../mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/known-loss.json)
- [`docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/fixture-plan.md`](../mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/fixture-plan.md)

Implementation of `packages/adapter-builder-json` is out of scope for this ticket (deferred to issue #19).

## Capability identity

| Field | Value |
|---|---|
| Direction | import |
| Source format | `green-agent-creator` |
| Source version pin | `5c9e92d` (full commit `5c9e92d987f1251d62c172209fc53f8e8ac3372b`) |
| Target | canonical Agent schema `1.0.0` |
| Adapter id | `green-agent-creator-import` |
| Fidelity class | lossy semantic (enumerated losses in `known-loss.json`) |

Provenance written on every successful import:

- `provenance.source.format` = `"green-agent-creator"`
- `provenance.source.version` = `"5c9e92d"`
- `provenance.source.recordId` = creator `id` when present and non-null
- `provenance.adapter.id` = `"green-agent-creator-import"`
- `provenance.adapter.version` = adapter package semver at runtime (`0.0.0` in pre-package fixtures)
- `provenance.contentHash` = `sha256:` + lowercase hex of the raw input JSON bytes as imported
- `provenance.capturedAt` = optional ISO instant when known
- `agentId` = newly generated lowercase UUID v4 (never derived from creator `id`)

## Extension namespace

All creator-only state is retained under `extensions.greenAgentCreator` with this partition:

| Key | Contents |
|---|---|
| `workflow` | Builder choices and wizard bookkeeping: custom-profession setup fields, `skillBoostsUsed`, `orSkillChoices`, `profChoiceSkillSelections`, `statGenerationMethod`, `statArrayChoice`, `rolledStatValues`, `statAssignments`, `traumaticBackgroundEffects`, `professionKey`, `isCustomProfession`, `customProfessionName` (always, even when also mapped), `basePOW`, empty motivation slot array when retained, etc. |
| `skillConstruction` | Per-skill provenance keyed by source `instanceId`: `baseValueFromProfession`, `increases`, `isProfessional`, `isChoiceSkill`, `slotId`, plus `key` / `typeName` for correlation |
| `sheetBaseline` | Creator reset snapshot as-is |
| `identity` | Creator-local `id`, `createdDate`, and any `meta` / `version` values |
| `raw` | Unknown roots/keys and malformed-but-kept values, keyed by source path |

Live root values remain authoritative over `sheetBaseline`. Baseline/live disagreements produce informational diagnostics only.

## Global transform rules

1. **Block** when the root is not an object; `stats` is not an object; any of STR/CON/DEX/INT/POW/CHA is missing, non-numeric, or non-finite; or `skills` is not an array.
2. **Explicit values win.** Zero is explicit. Calculate only absent/null derived maxima. Warn on formula mismatch; never silently replace explicit values.
3. **Do not apply creator sharing sanitation.** Preserve source text exactly in extensions; canonical fields may trim only for matching/lookup, never for irreversible storage of preserved text.
4. **Unknown data** → `extensions.greenAgentCreator.raw` with a path-specific warning unless import is unsafe.
5. **Local-storage wrapper** `{id,name,profession,data}` is not part of this capability.
6. **Foundry calendar / campaign-epoch age prompts** are out of scope for this mapping; they belong to later Foundry import UI work.

## Destination mapping (summary)

Exact path rows are in `inventory.json`. Human summary:

### Identity and biography

| Source | Canonical | Notes |
|---|---|---|
| `personalInfo.name` | `identity.name` | Exact text when non-empty |
| `personalInfo.employer` | `biography.employer` | Exact text when non-empty |
| `personalInfo.nationality` | `biography.nationality` | Exact text when non-empty |
| `personalInfo.sex` | `biography.sex` | Exact text when non-empty |
| `personalInfo.age` | `biography.age` | Digit-only → non-negative int; other text → omit + extension + warn |
| `personalInfo.dob` | `biography.dateOfBirth` | Only when trimmed value is `YYYY-MM-DD`; else omit + extension + warn |
| `professionKey` / custom fields | `biography.profession` | Known key → pinned English catalog label; custom → `customProfessionName`; unknown key → raw key + warn. Keys/flags always also in `workflow` |
| *(absent in GAC)* | `identity.aliases`, `biography.education`, `biography.physicalDescription` | Leave unset |

Pinned English profession labels (`5c9e92d` `en.js`):

| `professionKey` | `biography.profession` |
|---|---|
| `anthropologist_archaeologist_historian` | Anthropologist, Archaeologist, or Historian |
| `computer_scientist_engineer` | Computer Scientist or Engineer |
| `federal_agent` | Federal Agent |
| `physician` | Physician |
| `scientist` | Scientist |
| `special_operator` | Special Operator |
| `custom_profession` | `customProfessionName` (see inventory) |

### Statistics and resources

| Source | Canonical |
|---|---|
| `stats.STR`…`CHA` | `statistics.strength`…`charisma`.`score` (ints; warn if outside 3–18, do not clamp) |
| `distinguishingFeatures.{STR,…}` | matching `statistics.*.distinguishingFeature` (non-empty only) |
| `derivedAttributes.HP/WP/SAN` | `resources.hitPoints/willpower/sanity.maximum` |
| `derivedCurrent.HP/WP/SAN` | corresponding `.current` (missing → maximum; all-zero block with positive maxima → treat as uninitialized and use maxima; otherwise keep explicit values including partial zeros) |
| `derivedAttributes.BP` | `resources.breakingPoint.baseline` |
| `derivedCurrent.BP` | `resources.breakingPoint.current` (same all-zero placeholder rule) |
| `basePOW` | `extensions.greenAgentCreator.workflow.basePOW` only (no canonical field) |

Absent in GAC (leave unset): `resources.wounds`, `exhausted`, `firstAidAttempted`.

### Skills

Ordinary GAC keys map through the fixed snake_case → camelCase table in `inventory.json` into `skills.standard.<id>` with `{ proficiency: value, failureMarked }`.

Typed families (`art`, `craft`, `foreign_language`, `military_science`, `pilot`, `science`) with non-blank `typeName` become `skills.custom[]` entries: new `id`, `group` = family key, `label` = trimmed `typeName`, `proficiency`, `failureMarked`.

Blank typed placeholders are skipped unless non-zero value or a resolvable fail mark makes them meaningful.

`unarmed_combat` maps to `skills.custom` (canonical `1.0.0` has no `unarmedCombat` standard skill) — recorded as known loss of standard-skill identity.

Unknown keys → custom + warning. Skill construction props → `skillConstruction`. `skillFailMarks` set `failureMarked`; unresolved IDs → `raw` + warning.

`skills.specialTraining` is always `[]` for this source (GAC has no special training model).

### Relationships and psychology

| Source | Canonical |
|---|---|
| `bonds[].description` | `relationships.bonds[].name` (trimmed; empty → synthetic placeholder name + warn) |
| `bonds[].score` | `relationships.bonds[].score` |
| *(generated)* | new `id`; `damagedSinceLastHomeScene: false`; `relationship` / `description` unset |
| `motivations[]` non-empty | `psychology.motivations[]` with new `id`, `statement`, `crossedOut: false`, no link |
| `disorder` non-empty | one `psychology.disorders[]` entry: new `id`, `name`, `cured: false` |
| `adaptations[]` | see below |
| `traumaticBackground` | `psychology.traumaticBackground` as the source enum string when non-null; unknown values preserved + warned; null/missing → omit |

Adaptation lines (case/whitespace tolerant):

- known Violence phrases → `{ kind: "violence", adapted: true }` (no `incidentMarks`)
- known Helplessness phrases → `{ kind: "helplessness", adapted: true }`
- other non-empty → `{ kind: "other", label: <exact text>, adapted: true }`

### Inventory and notes

| Source | Canonical |
|---|---|
| `items[]` non-empty / interior empties | `inventory.gear[]` with new `id`, `name` = exact string, `equipped: false`; no subtype inference |
| *(no structured source)* | `inventory.weapons/armor/rituals/tomes` = `[]` |
| `notes` non-empty | one `notes.player[]` entry `{ format: "plain", content }` |
| | `notes.handler` stays `[]` |

### Campaign state

`campaignState.impossibleLandscapes` is unset (not present in GAC).

## Known losses

See `known-loss.json`. Principal losses:

- Unarmed Combat is not a canonical standard skill.
- Free-text items cannot become typed weapons/armor/rituals/tomes without user remapping.
- Bond damage, motivation crossed-out, disorder cured, and adaptation incident marks are defaulted because GAC does not express them.
- Non-ISO `dob` cannot populate `dateOfBirth`.
- Creator-local IDs are not durable canonical identities.
- Special training, Handler notes, wounds/exhausted/first-aid, aliases/education/physical description, and Impossible Landscapes fields have no GAC source.

## Fixture plan

See `fixture-plan.md`. Caleb is the first golden; synthetic fixtures derived from the pinned source cover the contract’s remaining variants before the capability may claim full coverage.

## Out of scope

- Reverse export (canonical → GAC)
- Later GAC commits / historical builds
- Local-storage wrapper as a required input
- Foundry calendar-aware age reconciliation or interactive campaign-date prompts
- `packages/adapter-builder-json` implementation
