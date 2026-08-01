# Contributing

## Prerequisites

- Node.js 22
- Corepack
- pnpm 10.14.0, selected from the `packageManager` field in `package.json`

## Local setup

```sh
corepack enable
pnpm install --frozen-lockfile
```

Run the same verification sequence used by CI:

```sh
pnpm check
pnpm test
pnpm build
```

The workspace is still at the planning/scaffold stage, so recursive commands may have no implementation packages to run yet.

## Cursor cloud agents

The committed `.cursor/environment.json` performs an idempotent dependency install when Cursor creates or refreshes an Ubuntu cloud machine. No long-running terminal is configured until the repository has an application that needs one.

Before starting a cloud agent:

1. Connect the GitHub repository to Cursor with read/write access.
2. Use `main` as the base branch and let each agent work on its own branch.
3. Keep credentials in Cursor's encrypted environment-secret settings; never commit `.env` files.
4. Review the task's issue, `AGENTS.md`, `CONTEXT.md`, relevant ADRs, and the Wayfinder map before implementation.
5. Require the verification commands above before accepting agent work.

The large pinned upstream pregen corpus remains available to terminal-driven tests, but `.cursorignore` prevents Cursor from automatically indexing every fixture as model context.

## Planning and issues

The project plan is maintained through the Wayfinder map in GitHub Issues. Decisions live in their closed child tickets; the map contains linked summaries rather than duplicated specifications.

Do not infer compatibility with untested source versions. Follow the exact capability and fixture evidence recorded in `docs/research/`.
