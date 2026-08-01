# Fixture plan: canonical `1.0.0` → Foundry `14.365` + Delta Green `1.7.0`

## Purpose

List the golden and synthetic fixtures required before this export capability may claim full field coverage (issue #8). Implementation and vendoring are deferred to adapter work (#19). Existing-Actor apply behavior additionally depends on issues #7 and #10.

## Planned locations

| Kind | Path |
|---|---|
| Canonical input goldens | `fixtures/canonical/1.0.0/export-to-foundry/*.json` |
| Expected Actor source slices (optional) | `fixtures/foundry/14.365-deltagreen-1.7.0/expected-from-canonical/*.json` |
| Live apply verification exports | `fixtures/foundry/14.365-deltagreen-1.7.0/live-apply/*.json` |
| Checksums | `fixtures/canonical/1.0.0/export-to-foundry/SHA256SUMS` |

Import fixtures from the reverse capability may be reused as round-trip inputs after canonicalization.

## Fixture matrix

### F1 — Minimal create-new

**Covers:** name, six stats, standard skills at defaults/overrides, empty collections, system auto-add Unarmed Attack binding.

**Assert:** Actor `type=agent`; no duplicate Unarmed Attack; flags.agentId set; formula maxima; SAN/BP non-sentinel when derived.

### F2 — Full semantic Agent

**Covers:** biography including DOB/aliases (flags); HTML physical description; typed skills for all handbook families; special training; bonds; motivations with linked and unlinked disorders; both adaptation kinds with marks; all inventory Item types including Handler tome/ritual fields; Impossible Landscapes; player/handler notes (flags); wounds/exhausted/firstAid; skill failures.

**Assert:** system fields populated; unrepresentable flags present; Handler fields GM-gated in apply tests.

### F3 — SAN / BP edge cases

| ID | Variant |
|---|---|
| F3a | SAN current 99 |
| F3b | SAN current ≥ 100 → POW×5 + warning |
| F3c | BP baseline ≠ current (baseline flag written) |
| F3d | Adaptations with incidentMarks 0/1/2/3 |
| F3e | adapted true without marks → three incidents + info |
| F3f | `kind: other` adaptation → flags only + warn |

### F4 — Skills export

| ID | Variant |
|---|---|
| F4a | `heavyMachinery` → `heavy_machiner` |
| F4b | custom `unarmed_combat` → `system.skills.unarmed_combat` |
| F4c | Typed family customs → typedSkills keys stable across re-export when bindings exist |
| F4d | Non-family custom group → typedSkills + warn |
| F4e | unnatural without writing `failure` |

### F5 — Merge / Replace / Synchronize (policy fixtures)

| ID | Variant |
|---|---|
| F5a | Merge into blank fingerprint (#7 supplemental): placeholder replacement without mutable warnings |
| F5b | Merge into populated: mutable currents preserved by default |
| F5c | Merge: profile skill proficiency updates selected by default |
| F5d | Replace complete weapons scope with removal preview (#10) |
| F5e | Attempted Unarmed Attack deletion blocked by default |
| F5f | Stale Synchronize mutable changes deselected |

### F6 — Narrative and extensions

| ID | Variant |
|---|---|
| F6a | Plain / markdown physicalDescription → HTML + info |
| F6b | HTML passthrough |
| F6c | `extensions.greenAgentCreator` present but ignored for system writes |
| F6d | `extensions.foundry.sheet` restore on re-export |

### F7 — Live exact-target apply

At least one create-new and one merge applied on Foundry `14.365` + DG `1.7.0`, then re-exported, proving `_stats` markers and absence of written prepared-only fields.

## Test assertions (when implemented)

1. Canonical input parses as `1.0.0`.
2. Emitted Actor source validates against DG field expectations for create data.
3. Every canonical section either maps, parks in flags, or is listed in known-loss / ignored.
4. Semantic round-trip Foundry→canonical→Foundry (and the reverse starting from canonical) compares meaning per #8 — not byte equality, generated ids, `_stats`, or prepared projections.
5. Update Plan fixtures assert default selection classes from #7/#10.
6. Known-loss diagnostics fire where required.

## Coverage gate

Not releasable until F1–F2 goldens exist, F3–F6 synthetics (or waivers) exist, F7 live apply evidence is captured for the exact runtime tuple, and CI fails when an advertised export path lacks inventory classification.
