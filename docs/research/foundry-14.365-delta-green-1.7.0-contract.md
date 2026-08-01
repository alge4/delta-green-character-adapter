# Foundry 14.365 + Delta Green 1.7.0 Agent contract

## Decision summary

The first Foundry adapter target is the exact tuple **Foundry VTT 14 build 365 + Delta Green system 1.7.0**, with Actor subtype `agent`. The Delta Green source tag [`v1.7.0`](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/releases/tag/v1.7.0) resolves to commit [`7d86f90e1d25d47a316b94e072b14a34ca80366b`](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/commit/7d86f90e1d25d47a316b94e072b14a34ca80366b); the release explicitly introduces basic Foundry v14 compatibility.

The adapter should map semantic Agent data, preserve Foundry-owned metadata during updates, and keep imported collection identity in namespaced flags. It must distinguish persisted source fields from values added by the system's `prepareData` pass. A blank live Actor export now verifies the exact server's release markers and initial persisted defaults; a populated live export remains required to verify mutable and collection-rich variants.

## Authorities and evidence limits

- Foundry core authority: [v14 API](https://foundryvtt.com/api/v14/), especially the [Actor data shape](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.ActorData.html), [Actor operations](https://foundryvtt.com/api/v14/classes/foundry.documents.Actor.html), and [`DocumentStats`](https://foundryvtt.com/api/v14/interfaces/foundry.data.types.DocumentStats.html).
- System authority: Delta Green v1.7.0 TypeDataModel definitions and document-class preparation code at the pinned commit.
- Structural samples: repository pregens, for example [`ABAD, GLEN`](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/packs/source/pregens/ABAD__GLEN_9tpZ6YK0GMICHQbz.json). These pregens have old `_stats` values and are not proof of the target runtime export.

Foundry exports world Documents through `exportToJSON`, using compendium-cleaned data, and `toJSON` extracts source data rather than prepared runtime data ([export API](https://foundryvtt.com/api/v14/classes/foundry.ClientDocument.html#exportToJSON), [serialization API](https://foundryvtt.com/api/v14/classes/foundry.ClientDocument.html#toJSON)). Importing an export into an existing world Document calls `importFromJSON`, which updates that Document ([import API](https://foundryvtt.com/api/v14/classes/foundry.ClientDocument.html#importFromJSON)). Our workflow should not delegate merge semantics blindly to core import; it needs its own preview and field/collection policies.

## Core Actor document boundary

Foundry v14 defines Actor source data as `_id`, `_stats`, `effects`, `flags`, `folder`, optional `img`, embedded `items`, `name`, `ownership`, `prototypeToken`, `sort`, `system`, and `type` ([ActorData](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.ActorData.html)). For this edge:

- `type` **must be `agent`**. Other Actor types are future mappings.
- `name` is canonical Agent identity and should be mapped.
- `system` is the Delta Green-owned persisted payload detailed below.
- `items` are embedded semantic collections, but each item's core metadata remains Foundry-owned.
- `_id`, `folder`, `ownership`, `prototypeToken`, `sort`, `effects`, `img`, and non-adapter `flags` are Foundry/world presentation or access metadata. Preserve them on existing Actors by default. For create-new, omit IDs and let Foundry initialize defaults unless the user explicitly maps presentation data.
- `_stats` is provenance, never user character content. `coreVersion` describes the schema version, not creation time; `systemId` and `systemVersion` describe the system that last wrote the Document ([DocumentStats](https://foundryvtt.com/api/v14/interfaces/foundry.data.types.DocumentStats.html)).

Foundry validates create data against the registered schema, stores it in `_source`, and supports batched embedded-document creation. Updates are differential, but arrays are fully replaced; embedded Items should therefore be managed with `createEmbeddedDocuments`, `updateEmbeddedDocuments`, and explicit deletion rather than replacing `items` wholesale ([document creation/update guide](https://foundryvtt.com/api/v14/modules/foundry.documents.html#creating-documents), [Actor embedded operations](https://foundryvtt.com/api/v14/classes/foundry.documents.Actor.html#createEmbeddedDocuments)).

## Agent `system` contract

The v1.7.0 system registers `AgentData` for Actor type `agent` and seven item data models ([registration](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/deltagreen.js#L38-L55)). The Agent model combines base resources/statistics, human skills, sheet settings, and Agent-specific fields.

| Persisted path | Type and initial value | Semantics / update policy |
|---|---|---|
| `system.schemaVersion` | number, initial `1` | Delta Green's internal Agent data schema marker, distinct from our canonical schema. Validate/preserve; do not equate it to system release 1.7.0 ([Agent schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/agent.js#L8-L18)). |
| `system.health.{min,value,max}` | numbers, defaults 0/10/10 | `value` is mutable HP. `max` is recomputed from STR/CON during preparation; `min` is system resource metadata. Preserve current `value` on existing Actor unless approved ([base schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/base-actor.js#L7-L22), [resource shape](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/general.js#L12-L18)). |
| `system.wp.{min,value,max}` | numbers, defaults 0/10/10 | `value` is mutable WP; `max` is prepared from POW. Same preservation rule. |
| `system.statistics.{str,con,dex,int,pow,cha}.{value,distinguishing_feature}` | number + string | Canonical primary stats and features. Keys are lowercase in Foundry. `x5` is prepared/transient, not part of the v1.7.0 schema ([statistics schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/base-actor.js#L7-L22), [field shape](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/general.js#L20-L25)). |
| `system.skills.<key>.{proficiency,label,failure}` | number, string, boolean | Standard skills. `failure` is mutable improvement state. The source key for Heavy Machinery is the historical typo `heavy_machiner`; adapters must map it explicitly. Unnatural omits `failure` in the schema ([human skill schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/human-skills.js#L7-L61)). |
| `system.typedSkills` | arbitrary object | Each observed entry has `label`, `group`, `proficiency`, `failure`, keyed by a system-local ID such as `tskill_01`; no TypeDataModel validates its nested shape. Generate deterministic adapter keys, preserve existing unknown entries, and store stable matching provenance in flags ([typed field](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/human-skills.js#L57-L66), [pregen evidence](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/packs/source/pregens/ABAD__GLEN_9tpZ6YK0GMICHQbz.json#L376-L391)). |
| `system.specialTraining[]` | array of `{attribute,id,name}` strings | Semantic special-training collection. `id` is system-local identity; do not infer identity from array position ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/human-skills.js#L57-L66)). |
| `system.sanity.value` | number, initial 100 sentinel | Mutable current SAN. On preparation, values `>=100` are initialized to POW×5, so explicit target SAN at or above 100 cannot survive unchanged ([Agent schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/agent.js#L12-L33), [preparation](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/actor/actor.js#L164-L174)). |
| `system.sanity.currentBreakingPoint` | number, initial 101 sentinel | Mutable current breaking point. Initialized only through the SAN sentinel branch; preserve existing value on update unless approved. |
| `system.sanity.adaptations.{violence,helplessness}.incident{1,2,3}` | booleans | Six persisted incident checks, mutable campaign state. `isAdapted` is computed from all three checks and is not declared in the schema ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/agent.js#L15-L32), [calculation](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/actor/actor.js#L176-L204)). |
| `system.physical.description` | HTML string | Canonical physical description, with HTML semantics declared in the manifest/model. Sanitize safely while preserving supported rich text. |
| `system.physical.wounds` | string | Mutable narrative wound state; preserve by default on existing Actor. |
| `system.physical.firstAidAttempted`, `exhausted` | booleans | Mutable encounter/campaign state. |
| `system.physical.exhaustedPenalty` | number, initial `-20` | System configuration/state; preparation forces positive values negative. Preserve unless explicitly mapped ([physical schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/agent.js#L34-L45), [normalization](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/actor/actor.js#L217-L223)). |
| `system.biography.{profession,employer,nationality,sex,age,education}` | strings | Canonical profile. Age is intentionally string-valued. No DOB field exists in the v1.7.0 Agent schema, so canonical DOB needs preservation in adapter flags/extensions or user-directed notes ([biography schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/agent.js#L46-L53)). |
| `system.corruption.{value,haveSeenTheYellowSign,gift,insight}` | number, boolean, strings | Optional Delta Green system extension/campaign state. Preserve on existing Actors and in Foundry round trips even when the canonical core has no equivalent ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/agent.js#L54-L61)). |
| `system.settings.sorting.*`, `system.settings.rolling.defaultPercentileModifier` | booleans, number | Sheet/user behavior, not Agent meaning. Preserve existing; use system defaults on create ([settings schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/actor/base/sheet-settings.js#L1-L22)). |

### Prepared/runtime-only values

The custom Actor `prepareData` adds or overwrites `statistics.*.x5`, `statistics.str.meleeDamageBonusFormula`, `skills.*.targetProficiency`, skill UI booleans, `sanity.ritual`, `sanity.max`, `sanity.adaptations.*.isAdapted`, `sanity.breakingPointHit`, and `health.protection`; it also recomputes HP max and WP max ([Agent preparation](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/actor/actor.js#L125-L223)). These values are projections, not independent canonical inputs. Ignore them when reading if present in legacy exports; do not write them as authoritative fields. Foundry itself describes preparation as computation of values that need not be stored ([prepareData API](https://foundryvtt.com/api/v14/classes/foundry.ClientDocument.html#prepareData)).

## Embedded Item contracts

Every semantic collection entry is an embedded Item with core fields such as `_id`, `_stats`, `name`, `type`, `img`, `effects`, `flags`, `folder`, `sort`, `ownership`, and `system`. Item display name belongs to `Item.name`; `system.description` is the shared HTML field ([base item fields](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/base-fields.js#L1-L13)). Do not rely on legacy duplicate `system.name` found in old pregens.

| Item `type` | Persisted `system` fields | Mutable/preservation notes |
|---|---|---|
| `bond` | `description`, integer `score` (10), `relationship` (string), `hasBeenDamagedSinceLastHomeScene` (boolean) | Score and damage flag are campaign state. Match by adapter flag, then conservative normalized semantics; never by position ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/bond.js#L1-L15)). |
| `motivation` | `description`, `disorder`, `crossedOut`, `disorderCured` | Cross-out/cure state is mutable. Description/name mapping needs fixture confirmation because the system provides both document name and description ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/motivation.js#L1-L14)). |
| `weapon` | `description`, `skill`, integer `skillModifier`, integer `customSkillTarget`, `range`, `damage`, integer `armorPiercing`, integer `lethality`, `isLethal`, `killRadius`, `ammo`, `expense`, `equipped` | `ammo` and equipped state may be mutable. Damage/range/loss expressions are strings, not parsed numbers ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/weapon.js#L1-L24)). |
| `armor` | `description`, integer `protection`, `equipped`, `expense` | Equipped state affects computed total protection ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/armor.js#L1-L14), [calculation](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/actor/actor.js#L205-L215)). |
| `gear` | `description`, `equipped`, `expense` | Generic gear; preserve equipped state ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/gear.js#L1-L13)). |
| `tome` | `description`, `language`, `studyTime`, integer `unnaturalSkillIncrease`, integer `occultSkillIncrease`, `sanity.{notes,failedLoss,successLoss}`, HTML `handlerNotes`, `revealed` | Revealed/handler notes may be Handler-only campaign state; never overwrite implicitly ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/tome.js#L1-L29)). |
| `ritual` | `description`, `studyTime`, `sanity.*`, `learnedSanity.*`, integer `unnaturalSkillIncrease`, `activationCosts`, `activationTime`, `complexity`, HTML `handlerNotes`, `revealed` | Same secrecy/preservation rule ([schema](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/data/item/ritual.js#L1-L36)). |

`effects` are core ActiveEffect embedded documents, not represented by the canonical Agent model in this first edge. Preserve all existing effects and non-adapter flags. On create from canonical, do not invent effects.

## Version detection and provenance

Require or warn on the following target evidence:

1. runtime `game.version === "14.365"` (or equivalent release/build properties exposed by core);
2. runtime `game.system.id === "deltagreen"` and `game.system.version === "1.7.0"`;
3. imported/exported `_stats.systemId === "deltagreen"`, `_stats.systemVersion === "1.7.0"`, and `_stats.coreVersion === "14.365"` when present.

The source tag's [`system.json`](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/system.json#L1-L27) declares compatibility minimum 13, verified/maximum 14, but its source-tree `version` is `dev`; release packaging likely stamps the version. Consequently, the installed release artifact/runtime and a live export are the decisive version evidence. Repository pregens include older core/system versions and must not pass the exact-target provenance check.

Store our collection identity and source provenance only under a namespaced flag such as `flags.deltaGreenCharacterAdapter`, without modifying system-owned flags such as the auto-added Unarmed Attack markers. The system itself uses `flags.deltagreen.SystemName` and `flags.deltagreen.AutoAdded` for that item ([auto-add logic](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/actor/actor.js#L259-L300)).

## Import/update invariants

1. New Actor output uses `{name, type:"agent", system, items}` and lets Foundry generate `_id`, `_stats`, default ownership/folder/sort/art, and system defaults. The system's `Actor.create` supplies linked, sight-enabled, friendly prototype-token defaults for Agents ([create override](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/actor/actor.js#L242-L257)).
2. Existing Actor updates preserve core metadata, presentation, permissions, effects, non-adapter flags, sheet settings, corruption, physical/campaign state, current resources, adaptation incidents, skill failures, and mutable Item state unless each proposed change is approved.
3. Item matching order is adapter stable flag, then conservative type + normalized semantic identity. Ambiguity is a warning requiring user choice. Add unmatched imports; preserve unmatched existing Items; delete nothing by default.
4. Use dot-path Actor updates and embedded-document operations. Do not replace the Actor's `items` array or arbitrary `system` object wholesale.
5. After application, re-read the Actor's source and prepared data. Validate persisted semantic fields separately from calculated projections.
6. HTML fields require safe Foundry-compatible sanitization/rendering; do not flatten them merely because another source is plain text.

## Live fixture evidence

A blank Actor named `blank` was exported through Foundry's UI from the user's **14.365 / Delta Green 1.7.0** server and inspected read-only. The file `fvtt-Actor-blank-GZGftVGSKSRNSREr.json` has SHA-256 `F7A37B64C2DA8CB3358D21677192D54212AB84084431340EA83958D0C89B93BB`.

It confirms:

- `_stats.coreVersion` and `exportSource.coreVersion` are `14.365`; `_stats.systemId` is `deltagreen`; `_stats.systemVersion` is `1.7.0`;
- all six statistics persist with value `10`, standard skills persist with their Delta Green defaults, and typed skills and special training begin empty;
- HP and WP persist as `10/10`, while SAN `100` and Breaking Point `101` are initialization sentinels in source data;
- biography and physical text begin empty, adaptation incidents begin false, and Impossible Landscapes fields begin at zero/false/empty defaults;
- the Actor contains one system-owned `weapon` Item named `Unarmed Attack`, no effects, and no Actor flags.

This full untouched-default fingerprint identifies a safe initialization target. Importing known canonical fields and missing embedded Item types into such an Actor is normal initialization: additions and replacement of placeholder defaults must not create conflict or mutable-state warnings. Individual values such as a statistic of `10` are not sufficient to identify an untouched Actor. Warnings and errors remain appropriate for ambiguous/unmappable source data, validation failures, unexpected target divergence, or failed application/verification.

A second populated Actor export is still required. It should ideally contain:

- non-default HP, WP, SAN, breaking point, adaptation incidents, wounds/exhaustion, and failed skills;
- at least one typed skill and special training;
- each Item type, with changed mutable values and meaningful HTML;
- representative ownership, flags, effects, image, folder, and prototype token settings.

Use it to verify mutable serialization, whether prepared-only properties are absent, motivation/bond display conventions, typed-skill key shape, all Item variants, and any fields introduced by runtime migration. The blank/default export contract is fixture-verified; collection-rich and mutated-state coverage remains outstanding.

## Supported edge

The evidence supports designing these independent operations:

- `canonical Agent 1.0.0 -> new Foundry Actor (14.365 / DG 1.7.0)`;
- `Foundry Agent Actor export (14.365 / DG 1.7.0) -> canonical Agent 1.0.0`;
- `canonical Agent 1.0.0 -> reviewed merge into existing Foundry Agent Actor`.

It does not establish NPC/vehicle mappings, historical/future Foundry compatibility, or byte-identical round trips.
