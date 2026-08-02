# Adapter operation and capability contracts

`@delta-green-character-adapter/adapter-core` owns the UI- and runtime-independent contracts shared by adapters: structured diagnostics and remediation, immutable operation results, one-import `ResolutionSet` binding, deterministic fingerprints, privacy-safe summaries, directed capability records, and inventory / known-loss / evidence validation.

It depends only on `@delta-green-character-adapter/character-model` and `@delta-green-character-adapter/validation`. It contains no source parsing, Foundry API, UI, reusable mapping rules, or compatibility monitoring.

## Public seams

- **Diagnostics and operation results** — runtime-validated severities, completeness impacts, remediation actions, acknowledgement rules, and unsupported/unverified-version cases (#6). Completeness colors reuse the Completeness Assessment vocabulary from `@delta-green-character-adapter/validation`.
- **Determinism and privacy** — fingerprints and sorted diagnostic output are stable under object-key reordering; callers must classify personal/Handler-only fields so summaries redact them (ordinary scalars may preview).
- **ResolutionSet** — one-import resolutions bound to operation, source hash, diagnostic identity, and target identity/version; stale when those change or new findings appear.
- **Capability evidence** — `validateCapabilityEvidence` is the CI gate for exact directed capability records: inventory, known-loss, fixture checksums, and present artifacts must agree (#8). Registry wiring lands with the tracer-bullet packaging ticket.
