# Gycklarn spreadsheet libraries (Node 24 + Foundry bundle)

Research for [issue #48](https://github.com/alge4/delta-green-character-adapter/issues/48). Primary sources are official package docs, npm metadata, library source/API, and read-only inspection of the Gycklarn evidence files. No live Google Sheets API was used.

## Decision summary

Use **one stack**: SheetJS Community Edition, package name `xlsx`, version **0.20.3**, installed from the SheetJS CDN tarball (not the stale npm registry build).

That single library reads Gycklarn `.xlsx` and `.ods` cell values **and** cached formula results in Node 24 package tests and in the Foundry v14 browser module bundle (Vite for wizard `dev:browser`, esbuild `platform: "browser"` for the packaged `main.js`).

Do not add ExcelJS. It cannot read ODS. Do not split readers unless a later filled `.ods` fixture proves SheetJS drops a required cached value.

Do not evaluate formulas. The map already prefers stored/cached values; SheetJS CE is a file I/O library and will not compute results.

## Repo starting point

No workspace package currently depends on a spreadsheet library. `pnpm-lock.yaml` has no `xlsx`, `exceljs`, or other workbook reader. The Foundry module (`apps/foundry-module`) bundles workspace adapters with esbuild to browser ESM and already shims `node:crypto`; it does not yet parse workbooks. The project brief still lists a future `packages/adapter-xlsx`, which has not been created.

## Evidence files (read-only)

Inspected 2026-08-15. SHA-256 is of the downloaded bytes.

| File | Bytes | SHA-256 |
|---|---|---|
| `C:\Users\alge4\Downloads\Copy of Delta Green Character Sheet.xlsx` | 18412 | `197F11F174BBB0696F6528601CF57B4C5B8E20B80850A2E1B509B8E4DF91B94F` |
| `C:\Users\alge4\Downloads\Copy of Delta Green Character Sheet.ods` | 19486 | `63BDB2CFA166D732D0CD8002341E0A4687B381FBEECBE4A304A1178359242820` |
| `C:\Users\alge4\Downloads\Delta Green Character Sheet - Alge.xlsx` | 19940 | `1544C02643F62A0BDED260056B23F7F086DDD61973829DCEB036C948E421270D` |

The workbooks are ZIP+XML. The filled Caleb `.xlsx` stores derived attributes as formula cells with cached `<v>` values, including shared formulas for statistic ×5:

| Address | Formula | Cached value in filled `.xlsx` |
|---|---|---|
| `L13:L18` | shared `(H13*5)` … `(H18*5)` | 40, 50, 70, 85, 50, 65 |
| `N20` | `ROUNDUP((H13+H14)/2,0)` | 9 (HP) |
| `N21` | `H17` | 10 (WP) |
| `N22` | `99-AP38` | 99 |
| `T22` | `H17*5` | 50 (SAN max) |
| `T23` | `IF(OR(ISBLANK(T22),ISBLANK(H17)),…)` | 40 (BP) |

Plain values are also present (`H13` STR `8`, `C5` name `Caleb Briggs `). The blank `.xlsx` has the same 11 formula cells, all with a cached `<v>` (zeros, empty string on `N21`, or the `[Missing POW or SAN]` sentinel on `T23`). The blank `.ods` stores the same derived formulas plus checkbox `of:=FALSE()` cells, each with `office:value` / text cache. A filled `.ods` is still outstanding on the map.

## Chosen package

### Identity and install

- Package: `xlsx` (SheetJS Community Edition)
- Pin: **0.20.3**
- Authoritative distribution: `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` ([Node install](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/), [bundler install](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/))
- License: Apache-2.0 ([CE license page](https://docs.sheetjs.com/docs/miscellany/license/)). Compatible with this MIT repo. Redistribution must keep copyright/license notices and include the short SheetJS attribution. SheetJS Pro is a separate paid product and is not required.
- Types: shipped as `types/index.d.ts` in the tarball.
- Public npm `xlsx@0.18.5` is a known stale registry copy. SheetJS documents it as out of date and recommends the CDN tarball. Prototype-pollution reports against older builds are documented as resolved in 0.19.3; still do not take 0.18.5 from npm.

Preferred install for this pnpm workspace (SheetJS also recommends vendoring the tarball):

```bash
pnpm add xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

or `xlsx@file:vendor/xlsx-0.20.3.tgz` after committing the tarball.

### Formats and runtimes

Official format table: XLSX/XLSM and ODS are both read and write in CE ([formats](https://docs.sheetjs.com/docs/miscellany/formats/)). ODS/FODS formulae parse to A1-style strings ([formulae](https://docs.sheetjs.com/docs/csf/features/formulae/)).

Official bundler support matches this repo: Vite 7.x and esbuild 0.25.x are listed as tested ([Vite demo](https://docs.sheetjs.com/docs/demos/frontend/bundler/vitejs), [esbuild demo](https://docs.sheetjs.com/docs/demos/frontend/bundler/esbuild)). Browser usage is `read(ArrayBuffer)`; `readFile` is Node-only ([parse options](https://docs.sheetjs.com/docs/api/parse-options/)). The ESM build does not pull `fs` / `stream` into a browser bundle; those are optional Node injections via `set_fs` / `set_readable`.

Verified here against the three evidence files with `xlsx@0.20.3` on Node 24:

- Filled `.xlsx`: 11 formula cells, all with `v` and `f` (shared slaves expanded to `(H14*5)` etc.).
- Blank `.xlsx`: same 11 cells; `N21.v` is `""`; `T23.v` is `[Missing POW or SAN]`.
- Blank `.ods`: same derived cells plus checkbox `FALSE()` formulas, all with cached `v`. SheetJS prints `ODS number format may be incorrect` for Google Sheets style expressions; values still extract. ODS `of:=` / `[.H13]` OpenFormula is translated to A1 `H13`.

### Exact read API (values and formulas)

SheetJS does **not** calculate formulae. Cached results live on `v`; formula text lives on `f` ([cell objects](https://docs.sheetjs.com/docs/csf/cell/), [formulae](https://docs.sheetjs.com/docs/csf/features/formulae/)). `cellFormula` defaults to `true`.

Use the cell object API. This source is a form layout, not a header table, so `sheet_to_json` is the wrong primary surface.

**Foundry / browser** (File / ArrayBuffer):

```js
import { read } from "xlsx";

const workbook = read(await file.arrayBuffer(), {
  type: "array",
  cellFormula: true,
  cellText: true,
});
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const hp = sheet.N20; // { t: "n", v: 9, w: "9", f: "ROUNDUP((H13+H14)/2,0)" }
```

**Node 24 tests** (Buffer is auto-detected; `type` may be omitted):

```js
import { readFileSync } from "node:fs";
import { read } from "xlsx";

const workbook = read(readFileSync(path), { cellFormula: true, cellText: true });
```

Adapter rules:

- Prefer `cell.v` as the stored/cached value.
- Keep `cell.f` when present so diagnostics can say “formula with/without cache”.
- Use `cell.w` only as display text (for example `40%` on `L13`), not as the numeric Agent value.
- Warn when `f` is set and `v` is `undefined` or `""` (blank `N21` is the fixture for that case). Do not invent maxima from statistics.
- Do not call SheetJS Pro’s formula calculator.

### Size in the Foundry artifact

Measured 2026-08-15 by esbuild `format: "esm"`, `platform: "browser"`, `target: "es2022"` — the same shape as `apps/foundry-module/scripts/package-module.mjs`:

| Import | Uncompressed esbuild output |
|---|---|
| `import { read } from "xlsx"` (0.20.3 ESM) | 755 300 bytes (~738 KiB) |
| `hucre/xlsx` + `hucre/ods` 0.6.2 | 295 552 bytes (~289 KiB) |
| `exceljs` 4.4.0 | 1 463 233 bytes (~1.4 MiB) |

Upstream standalone files in the 0.20.3 tarball: `xlsx.mjs` 1 008 308 bytes; `dist/xlsx.full.min.js` 951 904 bytes; `dist/xlsx.mini.min.js` 279 523 bytes. The mini standalone includes ODS parse/write and omits XLSB/XLS/Lotus/Numbers ([standalone install](https://docs.sheetjs.com/docs/getting-started/installation/standalone), [changelog](https://cdn.sheetjs.com/xlsx-0.20.3/package/CHANGELOG.md) note that mini includes ODS). The documented bundler entry is still `xlsx` / `xlsx.mjs`.

738 KiB uncompressed is large relative to the current module, but it is one dependency, has no Node polyfill tax, and is the official Vite/esbuild path. Start with `import { read } from "xlsx"`. If the packaged `main.js` budget later forbids that, switch to a dynamic `import()` of a thin wrapper (SheetJS documents this) or evaluate the mini build — do not switch libraries for size alone.

## Rejected and deferred options

### ExcelJS (`exceljs@4.4.0`) — reject as the stack

Official README: read/write **XLSX and CSV only**, MIT, browser prebundle `dist/exceljs.min.js` ([exceljs README](https://github.com/exceljs/exceljs/blob/master/README.md)). Formula cells are `{ formula, result }`; ExcelJS does not evaluate formulae and requires the cached `result` to be in the file.

Verified here: both Gycklarn `.xlsx` files expose `N20` / `T22` / `T23` as `ValueType.Formula` with `result` matching the XML cache. `workbook.xlsx.load` of the blank `.ods` produced **zero worksheets**. npm unpacked size is ~21.8 MB with Node-oriented dependencies (`jszip`, `archiver`, `unzipper`, `readable-stream`, `tmp`). The esbuild browser bundle was ~1.4 MiB.

ExcelJS would force a second ODS library, which the ticket forbids unless a single library fails a format or the browser bundle. It does not.

### hucre (`hucre@0.6.2`) — verified spare, not first choice

MIT, zero runtime dependencies, ESM, Node 18+ and browsers ([npm](https://www.npmjs.com/package/hucre), [README](https://github.com/productdevbook/hucre/blob/main/README.md), [`Cell` in `src/_types.ts`](https://github.com/productdevbook/hucre/blob/main/src/_types.ts)). Read API:

```ts
import { readXlsx } from "hucre/xlsx";
import { readOds } from "hucre/ods";

const wb = await readXlsx(uint8Array);
// formula metadata is on sheet.cells, keyed "row,col" (0-based)
// cell.value / cell.formulaResult = cached result; cell.formula = text
```

Verified here on all three evidence files: filled `.xlsx` has `formula` + `formulaResult` for `N20=9`, `T22=50`, `T23=40`; shared slaves keep the cached number with an empty `formula` string; blank `.ods` returns the same derived caches (ODS formula text keeps `;` argument separators). hucre does not evaluate formulas ([issue #155](https://github.com/productdevbook/hucre/issues/155)).

Not chosen as the first stack because it is 0.6.x (published 2026, no npm dependents at inspection) and is not the toolchain SheetJS already documents for Vite/esbuild. Revisit only if the SheetJS artifact cost becomes a hard module-size constraint.

### Other names (not selected)

- npm `xlsx@0.18.5` and unofficial republishes (`@e965/xlsx`, `xlsx-js-style`): stale or third-party copies of SheetJS. Use the CDN 0.20.3 tarball.
- `node-xlsx`, `read-excel-file`, `xlsx-populate`: XLSX-focused wrappers; they do not replace a dual-format CE reader.
- `openjsxl`: another young zero-dep reader that claims ODS cached values. Not needed after SheetJS and hucre both passed the evidence files.

## Adapter implications

1. Depend on `xlsx@0.20.3` from the SheetJS CDN (prefer a vendored tarball).
2. Parse with `read(..., { cellFormula: true, cellText: true })` in both Node tests and the Foundry File picker.
3. Map by A1 address on `workbook.Sheets[name]`. Treat `v` as the Agent value and `f` as diagnostic provenance.
4. Keep Apache-2.0 notices in the module artifact / open-source disclosure.
5. Treat ODS checkbox `FALSE()` cells that appear as numeric `0` (versus boolean `false` in `.xlsx`) as format-specific known-loss, not a reason to add a second library.
6. When a later filled `.ods` arrives, re-run the same `read` probe on `N20` / `T22` / `T23` before changing stacks.
