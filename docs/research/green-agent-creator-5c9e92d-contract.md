# Green Agent Creator `5c9e92d` import contract

## Decision summary

The initial adapter should accept the **raw character object** exported by Green Agent Creator at commit [`5c9e92d987f1251d62c172209fc53f8e8ac3372b`](https://github.com/greenagentcreator/charactercreator/commit/5c9e92d987f1251d62c172209fc53f8e8ac3372b). The source is the contract authority; Caleb is the first golden fixture, not a complete schema.

Import should map completed Agent meaning into canonical schema `1.0.0`, retain creator-only state under `extensions.greenAgentCreator`, preserve explicit current/derived values, calculate only missing values, and diagnose contradictions. It must not require byte-for-byte conformance to Caleb because the creator itself permits missing fields, legacy shapes, and string/number drift.

The export contains no reliable schema discriminator. `version.json` identifies the deployed asset build, but the exported object is simply `JSON.stringify(getExportCharacterData())`; no version is injected ([export implementation](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/components/sheet-toolbar.js#L167-L220), [build metadata](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/version.json)). Therefore compatibility with `5c9e92d` must be an adapter configuration/provenance claim, with structural detection and diagnostics rather than a payload-version check.

## Evidence and fixture

- Primary source: Green Agent Creator repository at the full commit above.
- Fixture: `C:\Users\alge4\Downloads\delta_green_character_Caleb.json`, inspected read-only, SHA-256 `6AF3EB7BEDE19085910A9AC373613D5D8D9C6A07F0BB7E06FC8290B900DE4F10`.
- The creator's own import gate requires only an object with `stats`, six numeric stat properties, and a `skills` array. It does not deeply validate the remaining fields ([import validation](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/validation.js#L274-L308)). Its separate sharing validator permits many optional roots and only shallowly validates collection/container types ([content schema validation](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/content-moderation.js#L82-L139), [checks](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/content-moderation.js#L244-L335)).

## Payload boundary

The file-export action emits the character object directly, not the local-storage wrapper. Local storage separately wraps it as `{id, name, profession, data}` and adds timestamps ([autosave wrapper](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/app.js#L345-L383), [storage timestamps](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/storage.js#L45-L83)). The adapter's required first input is the raw object. It may recognize the wrapper as a non-blocking convenience later, but that is not part of this pinned contract.

The initialized raw object has the roots shown below ([model defaults](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/model/character.js#L20-L58)). Roots are classified by their canonical significance, not merely by whether Caleb happens to populate them.

## Canonical character fields

| Source path | Observed/source type | Import meaning and constraints |
|---|---|---|
| `personalInfo` | object, possibly absent/partial | Profile container. Known keys are `name`, `employer`, `sex`, `nationality`, `age`, `dob`. Text fields are free text; the creator's sharing sanitizer caps name 80, employer 120, nationality 80, and general text 2000 characters ([limits and allowlist](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/content-moderation.js#L60-L139)). Preserve unknown nested keys in the extension. |
| `personalInfo.age` | number, string, or empty string | Creation stores an integer or `""`; sheet editing stores trimmed text. Caleb demonstrates string `"24"` while its baseline contains number `24` ([creation input](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/steps/step5-personal-info.js#L47-L58), [creation assignment](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/steps/step5-personal-info.js#L105-L113), [sheet assignment](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/sheet-edit.js#L101-L125)). Normalize a digit-only non-empty value to canonical integer; preserve and warn on other text. |
| `professionKey` | string or null | Stable creator profession key. A known configured key or `custom_profession`; an unknown non-empty key should still import as source profession text with a warning. The profession catalog is code-defined ([catalog](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/config/professions.js#L1-L20)). |
| `customProfessionName` | string | Canonical profession name only when custom; otherwise workflow metadata. |
| `isCustomProfession` | boolean | Corroborates custom profession; diagnose disagreement with `professionKey`, do not silently override either. |
| `stats.{STR,CON,DEX,INT,POW,CHA}` | finite numbers | Primary stats. All six are the creator's only strongly required nested fields. Creation methods normally produce integers; sheet edits clamp to 3–18 ([import gate](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/validation.js#L274-L308), [sheet clamp](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/sheet-edit.js#L64-L71)). Reject non-finite/non-numeric values; warn rather than silently clamp out-of-range numeric exports. |
| `distinguishingFeatures` | object of stat key to string | Sparse map; empty strings and missing keys are equivalent absence. Preserve unknown keys diagnostically. |
| `derivedAttributes.{HP,WP,SAN,BP}` | object of numbers, sometimes missing/zero in unfinished or legacy data | Creator-calculated maxima/baseline: `HP=ceil((STR+CON)/2)`, `WP=effective POW`, SAN and BP vary with traumatic background. Preserve explicit values, calculate only missing ones, warn on mismatch ([calculation](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/model/character.js#L90-L142)). |
| `derivedCurrent.{HP,WP,SAN,BP}` | partial object of non-negative numbers | Mutable campaign state. Missing keys are defaulted by the creator to corresponding derived maxima; explicit zero is meaningful and must not be treated as missing ([defaulting](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/model/character.js#L144-L164)). Caleb explicitly has four zeros. Preserve these values and require review before overwriting an existing Actor. |
| `bonds` | array of `{description, score}` | Ordered character collection. `description` is free text; `score` is numeric in generated/sheet-edited data. Creator sharing limits to six and description to 280 characters ([sanitizer](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/content-moderation.js#L60-L78), [bond normalization](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/content-moderation.js#L182-L196)). Import more than six without data loss but warn it exceeds the pinned producer's supported shape. Do not use position as durable identity. |
| `motivations` | array of strings | Up to five in creator sharing; initialization is five empty strings, while sheet normalization may remove invalid elements. Retain non-empty entries as semantic motivations and preserve empty slots only in the extension ([defaults](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/model/character.js#L38-L44), [limits](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/content-moderation.js#L60-L78)). |
| `traumaticBackground` | one enum string or null/missing | Known values are `extreme_violence`, `captivity`, `hard_experience`, and `things_man_was_not_meant_to_know`; UI `none` normalizes to null ([application logic](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/steps/step4-traumatic-background.js#L69-L114)). Unknown values are preserved and warned. |
| `basePOW` | finite number or null/missing | Semantically relevant only for captivity: original POW used for SAN before the background's POW reduction. Preserve it when present; diagnose incoherent combinations ([captivity handling](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/steps/step4-traumatic-background.js#L82-L105), [SAN calculation](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/model/character.js#L111-L130)). |
| `adaptations` | array of strings | Campaign state; creator sharing caps at five. Background logic currently generates `Adapted to Violence` or `Adapted to helplessness`, but sheet edits allow arbitrary non-empty lines ([background effects](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/steps/step4-traumatic-background.js#L95-L105), [sheet edits](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/sheet-edit.js#L195-L207)). Preserve arbitrary strings. |
| `disorder` | string, null, missing, or empty string | Mutable campaign state. Normalize null/missing/empty to absent canonically, retaining the raw distinction in the extension if lossless re-export is desired. |
| `items` | array of strings | Generic free-text equipment, not structured weapon/armour objects. Sheet editing retains interior empty strings and removes only trailing blanks; sharing caps at 50 items and 120 characters each ([sheet collection](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/sheet-edit.js#L200-L219), [limits](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/content-moderation.js#L60-L78)). Canonical import should create generic gear entries, not infer item subtype from prose without a warning/remapping choice. |
| `notes` | string | Free text; preserve as notes. Creator sharing sanitization truncates to 2000 characters, but local file export stringifies the unsanitized raw model. Do not truncate on our import. |
| `skills[]` | array of skill objects | Required array; see detailed contract below. |
| `skillFailMarks` | array of skill `instanceId` strings | Mutable campaign state indicating failed checks. References may be stale; retain resolvable marks, warn and preserve unresolved IDs ([mark storage](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/sheet-edit.js#L39-L62)). |

## Skill element contract

The source initializes one entry for every configured skill, then adds typed instances. The authoritative skill keys and base ratings live in [`ALL_SKILLS`](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/config/skills.js#L1-L52). Typed families are `art`, `craft`, `foreign_language`, `military_science`, `pilot`, and `science`.

| Field | Type/variant | Meaning |
|---|---|---|
| `instanceId` | non-empty string | Creator-local identity, generated from key/type plus time/random suffix; preserve as source identity but never parse it for meaning or assume it is deterministic ([generator](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/model/character.js#L9-L17)). |
| `key` | string | Skill family/key. Unknown keys should be preserved as custom skills with a warning rather than dropped. |
| `typeName` | string, empty string, or null | Null for ordinary skills; initialized typed-family placeholders use `""`; real typed instances use free text. A typed-family entry with blank type is a placeholder, not a meaningful typed skill. |
| `value` | number | Current percentage. Character creation normally caps increases at 80, while later sheet edits allow 0–99 ([creation constants](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/config/constants.js#L1-L7), [model modification cap](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/model/character.js#L225-L234)). Preserve explicit 0–99; warn on other finite values and reject non-finite/non-numeric values. |
| `baseValueFromProfession` | number | Builder provenance used to explain construction, not the current rating. Preserve in extension. |
| `increases` | non-negative integer | Count of 20-point personal-skill boosts; builder provenance. Caleb demonstrates values 0–2. |
| `isProfessional`, `isChoiceSkill` | booleans | Builder selection provenance. |
| `slotId` | string or null | Builder profession-slot identity; workflow-only and nullable. |

Do not deduplicate typed skills by `key`; identity is at least `(key, normalized typeName)`, with ambiguity diagnostics for duplicates. Do not import blank typed placeholders as canonical skills unless their non-zero value or other evidence makes them meaningful.

## Creator workflow/provenance fields

These fields explain how the character was built but do not describe the playable Agent independently. Retain their raw values in `extensions.greenAgentCreator` and exclude them from ordinary Foundry output:

- `customProfessionBonds`, `customProfessionSkillPointBudget`, `customProfessionSelectedSkills`, `customProfessionSetupStage`;
- `skillBoostsUsed`, `orSkillChoices`, `profChoiceSkillSelections`;
- `statGenerationMethod`, `statArrayChoice`, `rolledStatValues`, `statAssignments`;
- skill construction properties other than key/type/current value;
- `traumaticBackgroundEffects` bookkeeping, including `_effectsApplied`, `hardExperienceSkills`, removed-bond index/data, and similar reversible-wizard state;
- `sheetBaseline`, a reset snapshot rather than a second authoritative character;
- creator-local `id`, `createdDate`, and any `meta`/`version` values.

The four stat-generation modes are `array`, `roll`, `pointbuy`, and `manual`; the three predefined arrays are source constants ([mode UI](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/steps/step2-statistics.js#L34-L112), [arrays](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/config/constants.js#L1-L14)). None should be used to override explicit `stats`.

`sheetBaseline` is captured as a partial snapshot of personal info, stats, distinguishing features, current derived values, bonds, motivations, disorder, adaptations, items, notes, skill IDs/values, and empty fail marks. Reset reapplies it and recalculates maxima ([capture/apply implementation](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d987f1251d62c172209fc53f8e8ac3372b/js/utils/sheet-baseline.js#L6-L59)). Caleb proves it can disagree with the live object (bond whitespace and age type). The live root is authoritative; baseline belongs only in provenance.

## Normalization, validation, and diagnostics

1. **Block** if the root is not an object; `stats` is not an object; any of six stats is missing/non-numeric/non-finite; or `skills` is not an array. This mirrors the producer's minimum shape but strengthens number safety.
2. **Preserve explicit values.** Zero is explicit. Calculate only absent/null derived values. Warn when `derivedAttributes` conflicts with the pinned creator formula; never silently replace it.
3. **Treat mutable state distinctly.** `derivedCurrent`, bond scores, adaptations, disorder, and `skillFailMarks` are campaign state. Import fully for new Actors; propose rather than overwrite on existing Actors.
4. **Normalize tolerant variants.** Accept absent containers using model defaults; accept null/empty/missing variants documented above; coerce safe integer text only where the creator itself produces it (`age`, and cautiously user-edited numeric text). Every coercion should produce an informational diagnostic.
5. **Do not discard unknown data.** Unknown roots, nested keys, enum values, profession/skill keys, and malformed-but-serializable entries go to `extensions.greenAgentCreator.raw` with a path-specific warning unless they make safe import impossible.
6. **Do not apply creator sharing sanitation.** File export does not call the content sanitizer. Preserve text exactly (including whitespace) in source provenance; canonical normalization may trim for matching, never for irreversible storage.
7. **Cross-field diagnostics:** custom profession flags/key/name disagree; captivity lacks coherent `basePOW`; background-derived adaptations/stat changes conflict; duplicate or missing skill IDs; fail marks reference absent IDs; duplicate typed `(key,typeName)`; current derived values exceed maxima (warning, not error); bond scores exceed expected CHA; collection limits exceed creator UI limits; and baseline/live differences (information only).

## Fixture coverage and required additions

Caleb covers a configured profession, array stats, all ordinary skill placeholders, multiple typed Craft/Science skills, profession choices, explicit zero mutable values, three bonds, five motivations, partial distinguishing features, null traumatic background/disorder/IDs, empty collections, and a baseline/live type/whitespace disagreement.

It does **not** cover the variants below. Add source-generated fixtures before claiming those paths tested:

- each stat method (`roll`, `pointbuy`, `manual`) and unfinished/missing derived state;
- a custom profession and each configured profession pattern (OR choices and typed slots);
- each traumatic background, especially captivity `basePOW`, Hard Experience removed-bond bookkeeping, adaptations, and disorder;
- edited current HP/WP/SAN/BP, failed-skill marks, notes, arbitrary items, and values above character-creation caps;
- typed Art, Foreign Language, Military Science, and Pilot; duplicate type names and unusual Unicode/case/whitespace;
- legacy payloads omitting normalized fields and a payload with unknown root/nested fields;
- malformed boundary cases for every blocking rule.

## Implementation consequence

The Green adapter should be a tolerant, diagnostics-producing normalizer, not a strict mirror of the creator's weak validator and not a schema inferred from one JSON file. Its supported edge is:

`Green Agent Creator commit 5c9e92d raw Agent JSON -> canonical Agent schema 1.0.0`

This report does not claim reverse conversion, historical Green compatibility, or compatibility with later commits. Those require independent evidence and tickets.
