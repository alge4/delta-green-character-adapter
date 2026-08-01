# Delta Green v1.7.0 pregen corpus profile

## Result

The pinned Delta Green system `v1.7.0` tag resolves to commit
[`7d86f90e1d25d47a316b94e072b14a34ca80366b`](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/commit/7d86f90e1d25d47a316b94e072b14a34ca80366b).
Its pregen source directory contains 1,025 JSON documents, but only **1,001 are
Agent Actors**. The other 24 are Actor-folder records (`type: "Actor"`) for
profession groupings. Tests must classify those records rather than treating
all 1,025 files as Agents. The exact upstream directory is retained locally at
[`fixtures/upstream/delta-green-foundryvtt-system/v1.7.0/pregens`](../../fixtures/upstream/delta-green-foundryvtt-system/v1.7.0/pregens),
with provenance and regeneration instructions in its
[`README.md`](../../fixtures/upstream/delta-green-foundryvtt-system/v1.7.0/README.md).
The source directory and document forms can be inspected in the
[commit-pinned pregen tree](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/tree/7d86f90e1d25d47a316b94e072b14a34ca80366b/packs/source/pregens).

The corpus is valuable for broad legacy-input testing, but it is not a native
Foundry `14.365` / Delta Green `1.7.0` fixture set: all 1,001 Agents report
`_stats.systemId: "deltagreen"`, `_stats.systemVersion: "1.3.5"`, and
`_stats.coreVersion: "11.315"`. The build-365 runtime exports prove that
v1.7.0 migration removes several legacy/prepared fields and supplies fields
absent from the old source records.

## Method

The analysis checked out the exact tag, verified the commit, parsed every JSON
document under `packs/source/pregens`, and recursively inventoried paths and
runtime JSON value types. Counts and enum-like values were calculated across
all 1,001 `type: "agent"` records and their 4,064 embedded Items. Observed
paths were compared with the current TypeDataModel definitions for
[Agent](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/agent.js),
[base Actor resources/statistics](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/base-actor.js),
[human skills](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/human-skills.js),
[sheet settings](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/sheet-settings.js),
and all seven [Item models](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/tree/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item).

Two user-supplied exports were inspected read-only as exact-runtime evidence:

| Fixture | SHA-256 | Evidence |
|---|---|---|
| `fvtt-Actor-blank-GZGftVGSKSRNSREr.json` | `F7A37B64C2DA8CB3358D21677192D54212AB84084431340EA83958D0C89B93BB` | Untouched build-365/v1.7.0 defaults, sentinels, settings, and auto-added Unarmed Attack |
| `fvtt-Actor-arendt,-george-1JRxGMZ9oXtUmaSg.json` | `7E11F76B29B3BB8D849190515F48CBBBA140758BE8757E2C880528BE0F4B4341` | Migrated build-365/v1.7.0 pregen with three bonds and three Custom Skills |

The upstream George source is available for comparison at the
[pinned commit](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/packs/source/pregens/ARENDT__GEORGE_1JRxGMZ9oXtUmaSg.json).

## Corpus shape

All 1,001 Agents contain the main `system` groups for biography, corruption,
health, physical state, sanity, skills, Special Training, statistics, Custom
Skills, willpower, and `schemaVersion: 1`. Their structural collection variants
are narrow:

| Variant | Distribution |
|---|---|
| Bonds per Agent | 1: 40; 2: 210; 3: 401; 4: 350 (3,063 total) |
| Custom Skills per Agent | 1: 349; 2: 291; 3: 227; 4: 112; 5: 20; 6: 2 (2,172 total) |
| Custom Skill groups | Foreign Language: 772; Science: 528; Military Science: 347; Art: 305; Pilot: 210; Craft: 10 |
| Weapons | Exactly one Unarmed Attack per Agent (1,001 total) |
| Other Item types | Zero armour, gear, motivation, ritual, or tome Items |
| Special Training | Present but empty on every Agent |
| Effects | Empty on every Agent and Item |

Nested Custom Skill values consistently use `{group,label,proficiency,failure}`
under keys `tskill_01` through `tskill_06`; `failure` is always false. This is
observational evidence only because v1.7.0 deliberately declares
`typedSkills` as an unconstrained object, while Special Training has the
explicit entry schema `{attribute,id,name}`
([human-skills model](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/human-skills.js#L57-L66)).

Several string fields behave like loose display text, not reliable enums.
For example, sex is only `M` or `F` in this corpus, age combines an age and
birthday text (such as `35    (NOV 10)`), and nationality often combines
country and birthplace. Adapters should not make the corpus's observed values
stricter than the v1.7.0 schemas, which define biography fields as strings
([Agent biography schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/agent.js#L46-L53)).

The corpus exercises Bond scores from 5 through 18, but all relationships and
descriptions are empty and all damage flags are false. Its Weapon coverage is
only the auto-added Unarmed Attack: `skill=unarmed_combat`, `damage=1D4-1`,
`range=0M`, `expense=NA`, and `equipped=true`. It therefore exercises Bond and
Weapon field shapes, not their meaningful semantic ranges. The authoritative
current definitions remain the
[Bond schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/bond.js)
and [Weapon schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/weapon.js).

## Schema coverage and gaps

### Actor fields exercised

The source corpus covers the persisted field types for health and willpower;
all six statistics and distinguishing features; all Standard Skill
proficiencies, labels, and failure marks; the opaque Custom Skill object;
Agent schema version; SAN, Breaking Point, and all six adaptation incident
marks; physical description, wounds, and first-aid state; every biography
field; and all four Impossible Landscapes/corruption fields. The Heavy
Machinery key remains the schema's historical `heavy_machiner` spelling
([human-skills model](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/human-skills.js#L7-L61)).

### Current schema fields not meaningfully exercised

| Current v1.7.0 schema area | Corpus gap |
|---|---|
| `system.settings.sorting.*` and `system.settings.rolling.defaultPercentileModifier` | Entire group absent; current runtime injects defaults |
| `system.physical.exhausted` and `exhaustedPenalty` | Both absent; current runtime supplies `false` and `-20` |
| `system.specialTraining[]` entry fields | Array exists but is always empty |
| Campaign/corruption state | Fields exist but all values are default/empty |
| Adaptation, wounds, first aid, Standard/Custom Skill failure state | Fields exist but are never meaningfully mutated |
| `armor`, `gear`, `motivation`, `ritual`, `tome` | Item types wholly absent |
| Weapon variants | No firearm, lethal, armour-piercing, ammo, range, expense, or equipped-state variation |
| Bond semantics | No relationship/description text or damage-state variation |
| Active Effects and Handler-only/rich HTML | Entirely absent |

The missing Actor fields are declared by the
[Agent model](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/agent.js#L34-L61)
and [sheet-settings model](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/sheet-settings.js).
The uncovered Item contracts are authoritative in the
[v1.7.0 Item model directory](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/tree/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item).

### Corpus fields outside the current persisted schema

Every source Agent persists fields that are absent from the v1.7.0
TypeDataModels:

- `system.statistics.<stat>.x5`;
- `system.sanity.max`;
- `system.sanity.adaptations.{violence,helplessness}.isAdapted`;
- `system.skills.<skill>.cannotBeImprovedByFailure`, including Unnatural; and
- duplicate `system.name` on every embedded Bond and Weapon.

The Actor preparation code calculates statistic multipliers, skill UI state,
SAN/adaptation projections, and other runtime values
([Actor preparation](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/actor/actor.js#L125-L223)).
Current Item display identity belongs to the document-level `name`; the common
Item schema contains only `description`
([base Item fields](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/base-fields.js)).
These old persisted projections/residuals must be recognized and ignored or
normalized, never treated as independent canonical meaning.

The George runtime export demonstrates that v1.7.0 migration strips those
legacy fields and adds the current settings/exhaustion defaults. It also
refreshes core v14 token and document provenance shapes. The blank export
demonstrates the same current schema from a newly created Actor. Neither file,
however, covers the absent Item types or materially mutated campaign state.

## Automated contract-test approach

1. **Pinned snapshot integrity.** Assert tag commit, upstream pregen tree
   `0760314e00fd58490a34e44b0b96ffd17b0e391c`, 1,025 documents, 1,001 Agents,
   24 folder records, 12,768,986 total bytes, and every digest in the retained
   `SHA256SUMS` manifest before running the suite. The
   upstream MIT licence is retained beside the snapshot
   ([upstream licence](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/LICENSE.txt)).
2. **Full-corpus ingestion.** Parse and normalize every Agent; separately
   classify the 24 folder documents. Assert no crash, deterministic generated
   identity, stable output independent of JSON property order, and explicit
   handling of every observed legacy field.
3. **Coverage inventory.** Snapshot aggregate path/type counts, Item-type
   counts, Custom Skill groups/counts, and other enum-like values. A changed
   upstream snapshot must produce a reviewable coverage diff, not silently
   widen compatibility.
4. **Semantic invariants.** Check derived HP/WP/SAN relationships and retain
   explicit values; normalize known prepared/residual fields; map Bond and
   Custom Skill identities without using array position; and verify
   canonicalization twice produces the same semantic result.
5. **Runtime migration evidence.** Keep the source George pregen and its
   user-exported build-365/v1.7.0 result as one migration comparison. Do not
   relabel all 1,001 old records as build-365 fixtures.
6. **Authoritative synthetic coverage.** Construct fixtures from the v1.7.0
   TypeDataModels for every schema field and Item type absent from the corpus.
   Validate those against a real build-365/v1.7.0 Foundry runtime when the
   Foundry integration test harness exists.

## Small curated golden suite

The smallest honest suite is capability-based rather than one golden per
upstream Agent:

1. **Blank runtime initialization:** the exact blank export; verifies current
   defaults, sentinels, settings, and system-owned Unarmed Attack behavior.
2. **Migrated populated Agent:** an anonymized George-like fixture plus its
   source/runtime pair; verifies biography, statistics/resources, three Bonds,
   three Custom Skills, and migration cleanup.
3. **Collection maxima:** one anonymized fixture with six Custom Skills and
   four Bonds. This covers the corpus's meaningful structural maxima without
   retaining a real generated identity.
4. **Special Training and mutable state:** synthetic from the current schema,
   with Special Training, failed skills, damaged Bond, resource damage,
   adaptation incidents, wounds/exhaustion, and campaign state.
5. **All uncovered Item contracts:** one synthetic Agent containing armour,
   gear, motivation/disorder state, a non-default weapon, ritual, and tome,
   including Handler-only rich HTML and reveal/learning state.
6. **Identity/ambiguity edge:** synthetic duplicate-name collections with
   stable adapter bindings, unknown flags/extensions, and a deliberate
   ambiguous semantic match.

Items 4–6 are necessarily synthetic because the upstream corpus provides zero
evidence for those capabilities. If test isolation is clearer, split Item 5
into one fixture per Item type; that increases fixture count but not required
semantic coverage. The anonymized goldens should be generated from the pinned
records or schemas and contain no unnecessary real names, notes, IDs, user IDs,
or world metadata.

## Conclusion

Use all 1,001 upstream Agents as a high-volume legacy-shape contract test and
the 24 folder records as classification tests. Use the two build-365 exports
as exact-runtime evidence, and fill schema gaps with a small, anonymized,
capability-oriented golden suite. Passing the corpus proves broad ingestion of
the observed v1.3.5-era shapes; it does **not** prove complete v1.7.0 schema or
Item coverage by itself.
