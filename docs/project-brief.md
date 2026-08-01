# Project Brief

## Vision

Delta Green Character Adapter is an interoperability layer, not a character builder. It provides a canonical, versioned representation of a Delta Green character and converts between that representation and external tools.

```text
Builder JSON ----\
Foundry export ---+--> Canonical character --> Foundry actor
XLSX / Sheets ----+                        \--> Printable PDF
Future sources ---/                         \-> Canonical JSON
```

JSON object order is irrelevant. Mappings are determined by field names, nesting, types, and meaning.

## Design principles

1. The canonical model describes Delta Green concepts, not Foundry implementation details.
2. Source adapters never call target adapters directly.
3. Foundry metadata such as IDs, ownership, folders, flags, effects, and token settings stays in the Foundry adapter.
4. Semantic collections such as bonds, motivations, weapons, armour, gear, rituals, and tomes remain distinct in the canonical model, even where Foundry stores them all as embedded Items.
5. Every conversion validates before producing output and reports actionable warnings.
6. Schema and adapter versions evolve independently.

## Initial scope

### Canonical model

- Identity and personal details
- Profession and employer
- Statistics and derived attributes
- Health, willpower, sanity, breaking points, and bonds
- Standard and typed/custom skills
- Motivations and disorders
- Special training
- Weapons, armour, gear, rituals, and tomes
- Notes and extensible metadata

### Foundry VTT v14 adapter

- Read Actor export JSON into the canonical model
- Create Actor data from the canonical model
- Map embedded bond, motivation, weapon, armour, gear, ritual, and tome Items
- Generate stable keys for `system.typedSkills`
- Preview changes before creation or update
- Support replace, merge, and preserve-existing collection policies

### Other adapters

- Current character-builder JSON, bidirectionally where practical
- XLSX workbook import
- Google Sheets input using the same workbook mapping
- Printable PDF output
- Canonical JSON import and export

## Architecture

```text
packages/character-model       Domain types and schema versions
packages/validation            Cross-field validation and diagnostics
packages/adapter-foundry-v14   Foundry reader and writer
packages/adapter-builder-json  Builder reader and writer
packages/adapter-xlsx          Offline workbook reader
packages/adapter-google-sheets Google Sheet acquisition and mapping
packages/adapter-pdf           Printable renderers
packages/shared                Shared utilities with no domain ownership
apps/foundry-module            Foundry v14 user interface and integration
apps/cli                       Conversion and diagnostics command line
apps/demo                      Browser-based adapter demonstration
```

## Quality requirements

- Strict TypeScript throughout
- Runtime validation at all external boundaries
- Unit tests for mappings and validation
- Golden fixtures for each external format
- Semantic round-trip tests rather than byte-for-byte Foundry comparisons
- No silent data loss; unsupported values produce warnings
- Deterministic output where the target permits it

## Delivery milestones

1. Canonical schema, validation, fixtures, and serialization
2. Foundry v14 reader/writer and round-trip tests
3. Builder JSON reader/writer and mapping documentation
4. Foundry module import wizard, preview, and actor updates
5. XLSX and Google Sheets support
6. Printable PDF templates

## Out of scope for the first release

- A replacement character builder
- PDF/OCR character-sheet import
- Automatic two-way live synchronization
- Additional VTT integrations
- Campaign management
