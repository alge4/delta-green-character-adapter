# PROTOTYPE — Foundry Agent-sheet import integration

> Throwaway UI prototype for [issue #9](https://github.com/alge4/delta-green-character-adapter/issues/9).
> Not production code. Do not merge the variant shell into main after a winner is chosen — keep this branch as the primary source.

## Question

What should the Foundry Agent-sheet integration look like and how should it behave, including:

- the import button
- green / amber / red Completeness Assessment indicator
- diagnostics and one-import remediation
- reviewed mutable-state updates (Update Plan)
- module-owned fields such as date of birth
- while preserving the upstream Delta Green sheet and schema

## Verdict

**Variant A — Header chrome + modal wizard** won (user preference, 2026-08-01).

The Foundry Agent-sheet integration uses a title-bar Completeness Assessment lamp plus Import control, with source pick → diagnostics / one-import remediation → Update Plan review → apply in a modal wizard. Module-owned fields such as date of birth stay out of the upstream schema and surface in Bio after import. Upstream Delta Green sheet tabs remain unchanged.

This branch keeps all three variants as the primary source. The accepted decision for main is recorded in `docs/adr/0001-foundry-agent-sheet-import-ui.md` (decision-only change; do not merge this prototype package into main).

## Assumption

This is a **UI** prototype (sub-shape B): there is no existing Foundry module page yet, so variants live on a throwaway browser mock of the Agent sheet window.

## Variants

| Key | Name | Structure | Result |
| --- | --- | --- | --- |
| `A` | Header chrome + modal wizard | Compact completeness dot + Import in the sheet window title bar; full flow in a modal | **Accepted** |
| `B` | Interchange tab | New sheet tab owns drop zone, diagnostics, remediation, Update Plan, and module-owned fields | Rejected |
| `C` | Status badge + side drawer | Persistent completeness badge; non-modal right drawer for the import/review flow; DOB beside Age in Bio | Rejected |

Switch with `?variant=A|B|C` or the floating bar.

## Run

From the repo root:

```bash
pnpm prototype:agent-sheet-import
```

Then open the printed local URL (default `http://localhost:5173/?variant=A`).
