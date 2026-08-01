# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** for ADRs that touch the area about to be changed.

If either does not exist, proceed silently. Do not flag its absence or create it pre-emptively. The Domain Modeling skill creates these files lazily when terms or decisions are resolved.

## File structure

This is a single-context repository:

```text
/
|-- CONTEXT.md
|-- docs/
|   `-- adr/
|       |-- 0001-example-decision.md
|       `-- 0002-another-decision.md
`-- apps/ and packages/
```

The pnpm workspace contains multiple delivery packages, but they serve one shared character-interchange domain.

## Use the glossary's vocabulary

When output names a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a needed concept is absent from the glossary, reconsider whether the term belongs to the project or note the gap for the Domain Modeling skill.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface the conflict explicitly instead of silently overriding it.
