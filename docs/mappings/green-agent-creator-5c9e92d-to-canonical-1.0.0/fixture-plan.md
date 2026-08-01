# Fixture plan: Green Agent Creator `5c9e92d` → canonical `1.0.0`

## Purpose

List the golden and synthetic fixtures required before this capability may claim full field coverage (issue #8). Implementation and vendoring of fixture files is deferred to adapter work (#19); this plan is the acceptance checklist.

## Planned locations

| Kind | Path |
|---|---|
| Owner golden (Caleb) | `fixtures/green-agent-creator/5c9e92d/caleb.json` |
| Synthetic variants | `fixtures/green-agent-creator/5c9e92d/synthetic/*.json` |
| Expected canonical snapshots (optional goldens) | `fixtures/green-agent-creator/5c9e92d/expected/*.json` |
| Checksums | `fixtures/green-agent-creator/5c9e92d/SHA256SUMS` |

Caleb evidence today (not yet vendored): local path `C:\Users\alge4\Downloads\delta_green_character_Caleb.json`, SHA-256 `6AF3EB7BEDE19085910A9AC373613D5D8D9C6A07F0BB7E06FC8290B900DE4F10`.

Community library records are **not** durable fixtures unless a contributor explicitly authorizes redistribution with build provenance ([sample corpus policy](../../research/green-agent-creator-sample-corpus.md)).

## Fixture matrix

### F1 — Caleb (owner golden)

**Covers:** configured profession; array stats; ordinary skill placeholders; typed Craft/Science; profession choices; explicit zero `derivedCurrent`; three bonds; five motivations (incl. empties); partial distinguishing features; null traumatic background/disorder; empty items/notes adaptations; baseline/live type/whitespace disagreement; `unarmed_combat` if present in export.

**Assert:** parse → canonical `1.0.0`; inventory classifications exercise without unclassified authoritative paths from this payload; extension partitions populated; contentHash stable for identical bytes.

### F2 — Stat generation modes

| ID | Variant |
|---|---|
| F2a | `statGenerationMethod: "roll"` with `rolledStatValues` / `statAssignments` |
| F2b | `pointbuy` |
| F2c | `manual` |
| F2d | unfinished/missing `derivedAttributes` (derive maxima; warn none or formula-only) |

**Assert:** explicit `stats` win; workflow retains method fields; derived fill-only-missing.

### F3 — Professions

| ID | Variant |
|---|---|
| F3a | custom profession (`custom_profession` + name + custom skill budget/bonds) |
| F3b–F3g | each configured profession key (anthropologist…, computer scientist…, federal agent, physician, scientist, special operator) |
| F3h | OR-choice and typed profession slots exercised |
| F3i | unknown `professionKey` + warning |
| F3j | `isCustomProfession` / key / name disagreement diagnostic |

**Assert:** `biography.profession` label/name rules; keys in `workflow`.

### F4 — Traumatic backgrounds

| ID | Variant |
|---|---|
| F4a | `extreme_violence` + Violence adaptation line |
| F4b | `captivity` + coherent `basePOW` |
| F4c | `captivity` + incoherent/missing `basePOW` (diagnose) |
| F4d | `hard_experience` + removed-bond bookkeeping in `traumaticBackgroundEffects` |
| F4e | `things_man_was_not_meant_to_know` + disorder string |
| F4f | unknown background string (preserve + warn) |

**Assert:** `psychology.traumaticBackground`; adaptations kind mapping; `basePOW` in workflow only.

### F5 — Mutable campaign sheet state

| ID | Variant |
|---|---|
| F5a | non-zero edited `derivedCurrent` HP/WP/SAN/BP |
| F5b | `skillFailMarks` resolvable |
| F5c | `skillFailMarks` with stale IDs |
| F5d | non-empty `notes` |
| F5e | arbitrary `items` including interior empty strings |
| F5f | skill `value` above creation cap (e.g. 90–99) |

**Assert:** currents preserved; fail marks; notes.player; gear-only items; warnings without clamping.

### F6 — Typed skills and oddities

| ID | Variant |
|---|---|
| F6a | typed Art, Foreign Language, Military Science, Pilot (non-blank typeName) |
| F6b | blank typed placeholders (skipped) |
| F6c | blank typed placeholder with non-zero value (imported) |
| F6d | duplicate `(key, typeName)` (ambiguity warning) |
| F6e | unusual Unicode/case/whitespace in typeName |
| F6f | unknown skill key → custom + warn |
| F6g | dedicated `unarmed_combat` rating → custom + known-loss warning |

### F7 — Bonds / motivations / adaptations edge cases

| ID | Variant |
|---|---|
| F7a | >6 bonds (import all + warn) |
| F7b | empty bond description (placeholder name + warn) |
| F7c | bond score > CHA |
| F7d | free-text adaptation neither Violence nor Helplessness → `kind: other` |
| F7e | empty motivation slots only (canonical motivations empty; workflow may retain empties) |

### F8 — Legacy / unknown / malformed

| ID | Variant |
|---|---|
| F8a | legacy payload omitting normalized optional roots |
| F8b | unknown root + unknown nested personalInfo key → `raw` |
| F8c | non-ISO `dob` (omit dateOfBirth + warn) |
| F8d | non-digit `age` text (omit age + warn) |
| F8e–F8h | each blocking rule: non-object root; bad `stats`; missing/non-finite stat; non-array `skills` |

**Assert:** block vs warn boundaries match inventory `blockingRules`.

### F9 — Provenance / identity

| ID | Variant |
|---|---|
| F9a | payload with creator `id` / `createdDate` |
| F9b | payload without creator `id` |

**Assert:** provenance strings; `recordId` only when id present; `agentId` always new UUID; identity partition populated.

## Test assertions (when implemented)

For each fixture:

1. Structural detection accepts or blocks per inventory rules.
2. `parseAgentSnapshot` / `safeParseAgentSnapshot` succeeds on the produced snapshot (except blocked inputs).
3. Every authoritative source path in the fixture is classified by `inventory.json` (no silent drops).
4. Extension partition keys match the decided shape.
5. Known-loss diagnostics fire exactly where `known-loss.json` requires.
6. Semantic invariants: explicit zeros kept; no silent clamp; no invented incident marks; items not auto-subtyped.
7. Deterministic serialization of canonical output for equal semantic inputs modulo regenerated UUIDs (compare with UUID scrubbing or stable test ID injection).

## Coverage gate

The capability is not releasable until:

- F1 is vendored with checksum,
- F2–F9 synthetic fixtures exist for every row above (or an explicit waiver comments why a row is redundant),
- inventory, known-loss, fixtures, and tests agree,
- CI fails if an authoritative contract path is unclassified.
