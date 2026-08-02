# Delta Green Character Adapter

Exact-target interchange for playable Delta Green Agents.

The monorepo defines canonical Agent Snapshot `1.0.0` and the three verified directed capabilities needed for the initial tracer bullet:

| Direction | From | To |
|---|---|---|
| Import | Green Agent Creator `5c9e92d` JSON | Canonical Agent `1.0.0` |
| Import | Foundry `14.365` + Delta Green `1.7.0` | Canonical Agent `1.0.0` |
| Export / apply | Canonical Agent `1.0.0` | Foundry `14.365` + Delta Green `1.7.0` |

The user-facing path is local Green JSON → canonical → previewed/verified merge into a bound Foundry Agent sheet through the Foundry module wizard. Headless Foundry→canonical is proven alongside it. Adjacent Foundry, Delta Green, Green, and canonical versions are unsupported.

Machine-readable registry: [`docs/mappings/verified-capabilities.json`](docs/mappings/verified-capabilities.json).

## Fidelity and known loss

Each capability is `lossy-semantic`: playable Agent meaning round-trips where the exact target can persist it; inventoried losses are explicit.

- Inventories and known-loss manifests live under [`docs/mappings/`](docs/mappings/).
- Fixture plans and checksums live under [`fixtures/`](fixtures/) with provenance notes in each fixture root README.
- CI fails when registry, inventories, known-loss, checksums, fixtures, or tests disagree.

## Privacy and Handler-only content

- Character files are read locally in the Foundry client. The module does not upload character JSON.
- Handler-only values stay in the canonical model and Foundry GM-gated fields. Non-GMs do not see Handler-only Update Plan values and cannot apply Handler-only selections.
- Compact audit flags store identities, hashes, digests, fingerprints, scopes, counts, user, and time — never raw secret narrative.

## Recovery

Apply uses verified in-memory recovery snapshots before mutation. Snapshots are never written into module flags. Failed applies roll back; incomplete rollback surfaces authorized manual restore from the in-memory snapshot only.

## Structure

```text
apps/
  foundry-module/          # exact-runtime apply bridge + Agent-sheet wizard
packages/
  character-model/         # canonical Agent Snapshot 1.0.0
  validation/              # Completeness Assessment
  adapter-core/            # shared diagnostics, operations, capability registry
  adapter-green-agent-creator/
  adapter-foundry-deltagreen/
  foundry-update-planner/
docs/
  mappings/                # inventories, known-loss, verified registry
  research/                # source contracts and ADRs' research inputs
fixtures/
```

## Non-goals (initial prototype)

Green export; XLSX / Google Sheets; PDF / OCR; NPCs; vehicles; compatibility monitoring; historical or future versions; reusable mapping languages; live sync; campaign management.

## Development

Use Node.js 22 with Corepack and the pinned pnpm version:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

`pnpm build` for `apps/foundry-module` also emits the production Foundry artifact under `apps/foundry-module/artifact/delta-green-character-adapter/` (exact `module.json` metadata and production files only).

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development and Cursor cloud-agent setup.

Domain vocabulary is in [CONTEXT.md](CONTEXT.md). The Wayfinder map is [issue #1](https://github.com/alge4/delta-green-character-adapter/issues/1).
