# Foundry Agent-sheet import uses title-bar chrome and a modal wizard

The Foundry Character Adapter integrates into the upstream Delta Green Agent sheet without adding sheet tabs or altering the system schema. Import is launched from the Foundry window title bar beside a green/amber/red Completeness Assessment lamp; source pick, diagnostics with one-import remediation, Update Plan review (mutable campaign state preserved unless opted in), and apply run as a modal wizard. Fields the upstream schema cannot hold (for example date of birth) stay in module-owned namespaced flags and surface in Bio after import.

## Considered options

Prototyped on throwaway branch [`cursor/prototype-agent-sheet-import-253d`](https://github.com/alge4/delta-green-character-adapter/tree/cursor/prototype-agent-sheet-import-253d) for [#9](https://github.com/alge4/delta-green-character-adapter/issues/9):

- **A — Header chrome + modal wizard** (accepted): keeps upstream tabs intact; import is an explicit overlay flow.
- **B — Interchange tab**: dedicated workspace tab; rejected in favour of leaving the sheet navigation unchanged.
- **C — Status badge + side drawer**: persistent badge and non-modal drawer; rejected in favour of a clearer modal wizard.

## Consequences

Future Foundry module UI work should implement Variant A's shape, constrained by the diagnostics (#6) and existing-Actor update (#7) decisions. The full A/B/C prototype remains on the throwaway branch as primary source and must not be merged into main as production code.
