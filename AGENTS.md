## Agent skills

### Issue tracker

Issues and PRDs are tracked with GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

The repository uses the default five-role triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain-doc layout. See `docs/agents/domain.md`.

## Repository workflow

- Read `CONTEXT.md`, relevant `docs/research/` reports, and applicable GitHub decision tickets before changing domain behavior.
- Use Node.js 22 and the pnpm version declared in `package.json`.
- Install with `corepack enable && pnpm install --frozen-lockfile`.
- Before handing off code, run `pnpm check`, `pnpm test`, and `pnpm build`.
- Treat `fixtures/upstream/` as pinned external evidence. Do not edit upstream fixtures by hand or infer runtime compatibility solely from their historic provenance.
- Do not start prototype or implementation work unless its Wayfinder ticket is unblocked and explicitly selected.
- Advertise only the verified capabilities in `docs/mappings/verified-capabilities.json`. Adjacent versions are unsupported.

## Cursor Cloud specific instructions

- The dependency-refresh step (`corepack enable && pnpm install --frozen-lockfile`) runs automatically on VM startup; no manual install is needed before starting work.
- Workspace packages live under `apps/*` and `packages/*`. Recursive `pnpm check`, `pnpm test`, and `pnpm build` exercise those projects. Playwright browser tests for the Foundry wizard run as part of `apps/foundry-module`'s `test` script.
