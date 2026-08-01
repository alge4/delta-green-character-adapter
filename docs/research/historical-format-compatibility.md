# Historical format compatibility

Research for [issue #2](https://github.com/alge4/delta-green-character-adapter/issues/2), conducted 2026-08-01. This inventory uses only first-party release notes, repositories, source history, and API documentation. It does not expand the initial implementation target.

## Executive conclusion

The smallest honest compatibility model is **capability-based, exact-target, and evidence-backed**:

- `Green Agent Creator build 5c9e92d -> canonical schema 1.0.0`
- `canonical schema 1.0.0 <-> Foundry 14.365 + Delta Green system 1.7.0`

These are independently implemented conversion capabilities, not a promise of transitive or range compatibility. Each claim should name direction, exact upstream identity, canonical version, fixture set, and fidelity. Historical versions remain unsupported until a fixture and contract comparison prove that a capability also works for them. Version-specific branches or migrations should be added only at demonstrated structural boundaries.

This avoids both bad extremes: a combinatorial catalogue of assumed version pairs and a broad `v14`/`1.x` claim unsupported by evidence.

## Green Agent Creator

### What versions exist

The project has no GitHub tags or releases; its public history is a moving `main` branch. Therefore there is no first-party semantic release series to inventory. The application's query-string value is a cache-bust/build identity, and the history contains commits that stamp values such as `5c9e92d`, `09f6897`, and earlier identifiers. The pinned `5c9e92d` identity resolves to an immutable source commit and was stamped into the deployment by the following commit `66a638f` on 2026-06-16. [Pinned source](https://github.com/greenagentcreator/charactercreator/tree/5c9e92d), [stamp commit](https://github.com/greenagentcreator/charactercreator/commit/66a638f)

### Evidenced structural eras

- JSON export first appears in the November 2025 history, establishing a clear pre-export/JSON-export boundary. [commit](https://github.com/greenagentcreator/charactercreator/commit/7aba3cd)
- A November 2025 `database implementation` introduced persisted character storage, creating another meaningful boundary for saved-character payloads. [commit](https://github.com/greenagentcreator/charactercreator/commit/b5ef8b1)
- A May 2026 editable dossier change added autosave, failure marks, notes/items, and reset-to-baseline behavior. That is direct evidence that persisted characters can contain mutable sheet state and a baseline in addition to character-creation data. [commit](https://github.com/greenagentcreator/charactercreator/commit/fbfa963)
- A subsequent change capped bond inputs using CHA and updated them when CHA changes, evidence that even where field shape is stable, validation/derivation semantics may change between builds. [commit](https://github.com/greenagentcreator/charactercreator/commit/c3eb2a8)

The current character constructor and storage code are the authoritative contract for the pinned build; a single Caleb export is evidence for one instance, not a complete schema. [character model](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d/js/model/character.js), [storage implementation](https://github.com/greenagentcreator/charactercreator/blob/5c9e92d/js/utils/storage.js)

### Compatibility implication

Do not describe `5c9e92d` as a semantic version or infer support for adjacent cache-bust values. Record both the displayed build identity and immutable source commit used for contract extraction. Preserve unconsumed builder workflow/baseline state under the Green adapter extension, because that state is demonstrably part of modern saved characters but not necessarily part of a playable Agent.

## Foundry VTT v14

### What builds exist

Foundry's first-party release index records v14 builds from Prototype `14.349` onward and distinguishes Prototype, Development, Testing, and Stable channels. Stable releases include `14.359` and subsequent stable updates through the pinned `14.365`. [v14 release index](https://foundryvtt.com/releases/)

### Evidenced structural changes

Foundry core owns the document envelope, while the game system owns `Actor.system` and subtype data. The v14 `ActorData` contract contains core fields including `_id`, `_stats`, `effects`, `flags`, `items`, `name`, `ownership`, `prototypeToken`, `system`, and `type`, and explicitly describes `system` as subtype data defined by a System or Module. [ActorData v14](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.ActorData.html)

Within v14 itself, early builds contained documented data-model changes. Build `14.349` changed DataModel cleaning/update behavior and deprecated legacy update operators. Build `14.352` changed typed fields and validation behavior, including deserializing `EffectChangeData.value`. Build `14.353` moved `ActiveEffect.changes` to `ActiveEffect.system.changes`. These are real structural or serialization boundaries, especially if Active Effects are retained, even though they do not by themselves prove a change to Delta Green's Agent fields. [14.349](https://foundryvtt.com/releases/14.349), [14.352](https://foundryvtt.com/releases/14.352), [14.353](https://foundryvtt.com/releases/14.353)

Build `14.365` contains document/export provenance fixes involving `_stats.duplicateSource` and `_stats.exportSource`, further evidence that volatile core metadata should not participate in semantic equality. [14.365](https://foundryvtt.com/releases/14.365)

### Compatibility implication

Do not claim all v14 builds from an adapter tested only on `14.365`. Separate the stable semantic character content from Foundry-owned IDs, ownership, token settings, `_stats`, effects, and other envelope metadata. The pinned build is the sole initial runtime claim; older v14 builds are research candidates, not implied compatibility.

## Delta Green Foundry system

### What releases exist

The upstream repository has a long tag series from `v0.8.9` through `v1.7.0`. Release notes explicitly mark core-generation boundaries: `v1.1.0` requires Foundry v10+, `v1.2.0` is v11-compatible and breaks older compatibility, `v1.4.5` is v12-only, `v1.5.0` is v13-only, and `v1.7.0` adds basic v14 compatibility. [release history](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/releases)

### Evidenced structural changes

- `v0.8.9` added the general gear Item type, demonstrating that the embedded Item type set changed historically. [v0.8.9 release](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/releases/tag/v0.8.9)
- `v1.0.5` added GM-only Impossible Landscapes fields, demonstrating historical expansion of stored Agent data. [v1.0.5 release](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/releases/tag/v1.0.5)
- `v1.4.6` added exhaustion and its check penalty, another stored Agent-state expansion. [v1.4.6 release](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/releases/tag/v1.4.6)
- `v1.6.3` changed maximum HP/WP handling for unnatural actors and fixed SAN persistence, evidence that derivation and mutable-state behavior changes independently of field names. [v1.6.3 release](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/releases/tag/v1.6.3)
- `v1.6.6` fixed persistence of Agent physical description. A field's presence in a sheet is therefore not sufficient evidence that it was reliably serialized by every release. [v1.6.6 release](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/releases/tag/v1.6.6)
- `v1.7.0` changes the manifest compatibility to Foundry 14, removes legacy `template.json`, and replaces it with registered `TypeDataModel` classes for Agents and the seven embedded Item types. Several text fields become HTML fields. That is an actual validation/normalization and schema-registration boundary even where many serialized paths remain stable. [v1.6.6...v1.7.0 comparison](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/compare/v1.6.6...v1.7.0), [v1.7.0 source](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/tree/v1.7.0), [v1.7.0 manifest](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/v1.7.0/system.json), [v1.7.0 release](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/releases/tag/v1.7.0)

### Compatibility implication

The Delta Green system release, not Foundry core alone, is the authority for Agent and embedded Item meaning. A claim such as `Foundry v14 compatible` is insufficient; it must include the Delta Green release. Initial support stays exactly `14.365 + 1.7.0`.

## Canonical schema compatibility concerns

Canonical `1.0.0` has no historical versions yet. Its versioning policy should therefore describe only proven behavior:

1. Every canonical document identifies exactly `schemaVersion: 1.0.0`.
2. The first reader accepts exactly `1.0.0`; it does not promise tolerance for unimplemented minor or patch versions.
3. Supporting another canonical version requires an explicit migration/conversion capability and fixtures. A forward migration does not imply its reverse.
4. Import and export are separate capabilities. Green import does not imply Green export; canonical-to-Foundry and Foundry-to-canonical each need their own tests and fidelity declaration.
5. Fidelity is field-class aware: playable character meaning should round-trip semantically; Foundry envelope metadata may be preserved separately or regenerated; Green workflow state belongs in a namespaced extension unless promoted by a later canonical decision.

## Recommended compatibility record

Use a small machine-readable registry of **verified capabilities**, backed by adapter tests, rather than a pairwise mapping language. A record needs:

- adapter and adapter version;
- direction (`import` or `export`);
- exact source identity (including commit when the source has no releases);
- exact canonical schema version;
- exact target identity where applicable;
- fixture/test evidence;
- fidelity classification and known exclusions.

For the initial target, publish only these three capabilities:

| Direction | From | To | Claim |
|---|---|---|---|
| Import | Green Agent Creator commit/build `5c9e92d` | Canonical `1.0.0` | Verified by source-derived contract plus fixtures |
| Import | Foundry `14.365` + Delta Green `1.7.0` | Canonical `1.0.0` | Verified by system source plus exported fixtures |
| Export | Canonical `1.0.0` | Foundry `14.365` + Delta Green `1.7.0` | Verified by creation/update fixtures and semantic round-trip tests |

Reject or warn clearly on unverified identities according to the adapter's later validation policy. Do not silently select the nearest known version.

## Follow-up research, without widening initial scope

- Capture a real Agent export from the pinned Foundry tuple and compare it with the `v1.7.0` system defaults and embedded Item models.
- Generate Green fixtures covering empty/full optional collections, custom skills, mutable sheet state, and baseline reset state at `5c9e92d`.
- Only if historical support becomes a product requirement, sample releases at the evidenced structural boundaries above rather than testing every patch tag.
- Treat upstream monitoring as a later source-change detector that opens research work; it must not automatically assert compatibility from a new version number.
