# Foundry `14.365` + Delta Green `1.7.0` fixtures

Reviewed for the initial tracer-bullet release (#29).

## Provenance

| Artifact | Provenance | Licence / reuse |
|---|---|---|
| `fvtt-Actor-blank-*.json` | Blank Agent Actor exported from the pinned Foundry `14.365` + Delta Green `1.7.0` runtime. | System content remains under the upstream Delta Green Foundry system MIT licence (see `fixtures/upstream/delta-green-foundryvtt-system/v1.7.0/`). |
| `live-populated/*.json` | Live populated Agent Actor exports captured from the same exact runtime tuple. | Same upstream MIT coverage for system-owned defaults; campaign content is test evidence only. |
| `live-apply/*.json` | Exact-runtime create/merge Actor exports from the Foundry module apply ports (`FoundryWorldRuntime` / `FoundryActorRuntime`) with Foundry `14.365` / Delta Green `1.7.0` `_stats` (#29 F7). This is the repository's verified exact-runtime seam from #27, not a desktop Foundry world capture. | MIT, same as this repository. |
| `synthetic/*.json` | Deterministic synthetics authored in this repository from the pinned Foundry/DG contracts. | MIT, same as this repository. |

Legacy pregen corpus evidence lives separately under `fixtures/upstream/delta-green-foundryvtt-system/v1.7.0/` and is not exact-target export proof.

## Integrity

`SHA256SUMS` lists every JSON fixture in this directory tree. CI fails when advertised Foundry capability fixtures disagree with these digests.
