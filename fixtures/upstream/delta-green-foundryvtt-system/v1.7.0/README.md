# Delta Green system v1.7.0 pregen corpus

This directory vendors the upstream `packs/source/pregens` snapshot from the
Delta Green Foundry VTT system for adapter contract tests.

## Provenance

- Repository: <https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system>
- Tag: `v1.7.0`
- Commit: `7d86f90e1d25d47a316b94e072b14a34ca80366b`
- Upstream pregen Git tree: `0760314e00fd58490a34e44b0b96ffd17b0e391c`
- Snapshot: 1,025 JSON documents, 12,768,986 bytes
- Contents: 1,001 `agent` Actor documents and 24 Actor-folder documents
- File integrity: `SHA256SUMS` contains one SHA-256 digest per JSON document
- Licence: upstream MIT licence copied as `LICENSE.upstream.txt`

The source records were last written by Delta Green system `1.3.5` on Foundry
core `11.315`. They are broad legacy input variants, not evidence that an
individual record is a native Foundry `14.365` / Delta Green `1.7.0` export.

## Regeneration

From a temporary checkout of the exact tag:

```powershell
git clone --depth 1 --branch v1.7.0 `
  https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system.git `
  $env:TEMP/dg-system-v1.7.0

git -C $env:TEMP/dg-system-v1.7.0 rev-parse HEAD
git -C $env:TEMP/dg-system-v1.7.0 rev-parse v1.7.0:packs/source/pregens
```

Only replace `pregens/` when both identities match the values above. Copy
`packs/source/pregens` byte-for-byte and retain the upstream licence. Tests
should verify the document count, Git-tree identity, and regenerated
`SHA256SUMS` before treating a refreshed snapshot as authoritative.
