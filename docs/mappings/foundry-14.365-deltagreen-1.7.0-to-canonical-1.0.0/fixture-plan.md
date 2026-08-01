# Fixture plan: Foundry `14.365` + Delta Green `1.7.0` → canonical `1.0.0`

## Purpose

List the golden and synthetic fixtures required before this capability may claim full field coverage (issue #8). Implementation and vendoring of fixture files is deferred to adapter work (#19); this plan is the acceptance checklist.

## Planned locations

| Kind | Path |
|---|---|
| Live blank golden | `fixtures/foundry/14.365-deltagreen-1.7.0/fvtt-Actor-blank-GZGftVGSKSRNSREr.json` |
| Live populated golden | `fixtures/foundry/14.365-deltagreen-1.7.0/live-populated/*.json` |
| TypeDataModel / synthetic variants | `fixtures/foundry/14.365-deltagreen-1.7.0/synthetic/*.json` |
| Expected canonical snapshots (optional) | `fixtures/foundry/14.365-deltagreen-1.7.0/expected/*.json` |
| Checksums | `fixtures/foundry/14.365-deltagreen-1.7.0/SHA256SUMS` |

### Already pinned (contract evidence)

| File | SHA-256 | Role |
|---|---|---|
| `fvtt-Actor-blank-GZGftVGSKSRNSREr.json` | `F7A37B64C2DA8CB3358D21677192D54212AB84084431340EA83958D0C89B93BB` | Untouched build-365 / v1.7.0 defaults, sentinels, settings, system-owned Unarmed Attack |

The 1,001-Agent pregen corpus ([issue #11](https://github.com/alge4/delta-green-character-adapter/issues/11)) supports broad ingestion and path-classification tests only. It does **not** prove exact-target `14.365` / `1.7.0` export behavior.

## Fixture matrix

### F1 — Live blank Actor

**Covers:** release markers; default stats/skills; SAN/BP sentinels; empty collections; AutoAdded Unarmed Attack; empty biography/corruption; sheet settings.

**Assert:** import succeeds; sentinels normalize per inventory; Unarmed Attack → weapons; settings → `extensions.foundry.sheet`; no mutable-state conflict semantics required for blank fingerprint consumers (#7 supplemental).

### F2 — Live populated Actor (still required)

Must include non-default HP/WP/SAN/BP; adaptation incidents; failed skills; typed skill + special training; each Item type with mutable fields and HTML; representative ownership/flags/effects/img for ignore-classification; module flag DOB/aliases when available.

**Assert:** currents preserved; incident marks; custom skills; all Item collections; flags → canonical DOB/aliases; presentation ignored.

### F3 — Statistics and resources

| ID | Variant |
|---|---|
| F3a | Formula-agreeing HP/WP maxima |
| F3b | Persisted max disagrees with formula (warn + raw) |
| F3c | Explicit SAN `< 100` disagreeing with POW×5 (warn, keep current) |
| F3d | SAN sentinel `100` / BP `101` |
| F3e | Explicit BP non-sentinel with flag baseline |
| F3f | Wounds / exhausted / firstAidAttempted set |

### F4 — Skills

| ID | Variant |
|---|---|
| F4a | All standard keys including `heavy_machiner` |
| F4b | `unarmed_combat` skill → custom + known-loss warning |
| F4c | Typed skills for each handbook family with specialization labels |
| F4d | Typed skill with unknown group (import + warn) |
| F4e | Special training → statistic / standardSkill / customSkill uses |
| F4f | Skill failure marks; unnatural without failure field |
| F4g | Prepared-only skill fields present in legacy-shaped payload (ignored) |

### F5 — Psychology and relationships

| ID | Variant |
|---|---|
| F5a | Bonds with scores, relationships, damage flag, HTML description |
| F5b | Motivation without disorder |
| F5c | Motivation with disorder + cured flags |
| F5d | Name vs description disagreement on motivation/bond |
| F5e | Partial adaptation incidents (1–2 marks) |
| F5f | Fully adapted violence and helplessness (3 marks) |

### F6 — Inventory Items

| ID | Variant |
|---|---|
| F6a | Weapon with `unarmed_combat` skill + AutoAdded flags |
| F6b | Weapon with `isLethal` / `customSkillTarget` (extension only) |
| F6c | Armor / gear equipped + expense |
| F6d | Tome with handlerNotes + revealed false |
| F6e | Ritual with learnedSanity + activation fields |
| F6f | Unknown Item type → raw + warn |

### F7 — Biography / campaign / flags

| ID | Variant |
|---|---|
| F7a | Full biography including digit age and HTML physical description |
| F7b | Non-digit age → omit + raw + warn |
| F7c | Module-flag DOB + aliases recovered |
| F7d | Non-default Impossible Landscapes corruption block |
| F7e | All-default corruption → omit `campaignState.impossibleLandscapes` |
| F7f | Existing `flags…agentId` reused |

### F8 — Version / blocking / legacy

| ID | Variant |
|---|---|
| F8a–F8e | Each blocking rule |
| F8f | Legacy pregen `_stats` (warn; not exact-target) |
| F8g | Prepared projections injected (ignored) |
| F8h | Unknown `system.*` path → raw + warn |
| F8i | Non-`agent` type → block |

## Test assertions (when implemented)

1. Structural detection accepts or blocks per inventory rules.
2. Produced snapshots parse as canonical Agent `1.0.0`.
3. Every authoritative persisted path in the fixture is classified (no silent drops).
4. Extension partitions match the decided shape.
5. Known-loss diagnostics fire where required.
6. Semantic invariants: explicit zeros kept; no silent clamp; prepared values ignored; Unarmed Attack not duplicated in meaning; incident marks exact.
7. Deterministic serialization modulo regenerated UUIDs when unbound.

## Coverage gate

The capability is not releasable until:

- F1 is vendored with the pinned checksum,
- F2 live populated export is captured and checksummed,
- F3–F8 synthetics exist (or an explicit waiver explains redundancy),
- inventory, known-loss, fixtures, and tests agree,
- CI fails if an authoritative contract path is unclassified.
