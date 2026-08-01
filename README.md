# Delta Green Character Adapter

A TypeScript monorepo for interoperable Delta Green character data.

The project defines a versioned, Foundry-independent character model and adapters for importing and exporting character data across Foundry VTT v14, character-builder JSON, spreadsheets, and printable PDFs.

## Goals

- Preserve Delta Green character concepts without coupling the model to Foundry internals.
- Import and export Foundry VTT v14 actors with high fidelity.
- Support builder JSON, XLSX, and Google Sheets sources.
- Generate printable PDFs from any supported source.
- Provide preview, validation, merge, and update workflows in Foundry.

## Planned structure

```text
apps/
  cli/
  demo/
  foundry-module/
packages/
  adapter-builder-json/
  adapter-foundry-v14/
  adapter-google-sheets/
  adapter-pdf/
  adapter-xlsx/
  character-model/
  shared/
  validation/
docs/
```

## Initial roadmap

1. Define and version the canonical character schema.
2. Implement validation and JSON serialization.
3. Build bidirectional Foundry VTT v14 conversion with round-trip tests.
4. Add character-builder JSON conversion.
5. Build the Foundry import preview and update workflow.
6. Add spreadsheet sources and printable PDF outputs.

## Status

Initial project scaffold. Implementation has not started.

## Development

Use Node.js 22 with Corepack and the pinned pnpm version:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for local development, Cursor cloud-agent setup, and repository workflow.

The source-of-truth planning artifact is the [Wayfinder map](https://github.com/alge4/delta-green-character-adapter/issues/1). Domain vocabulary is recorded in [CONTEXT.md](CONTEXT.md), and source-contract research lives under `docs/research/`.
