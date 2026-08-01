# Canonical Agent model

`@delta-green-character-adapter/character-model` defines canonical Agent Snapshot schema `1.0.0`. It is source-independent: adapters translate source records into this model and target renderers consume it. Foundry document metadata and Green Agent Creator workflow data do not belong in canonical fields.

## Public API

- `parseAgentSnapshot` and `safeParseAgentSnapshot` validate untrusted values through the strict Zod schema.
- `assessAgentSnapshot` evaluates semantic invariants and derives green, amber, or red completeness.
- `serializeAgentSnapshot` emits UTF-8 JSON with recursively sorted object keys, two-space indentation, and one trailing newline. Array order is preserved for display only.
- `generateAgentJsonSchema` produces the portable JSON Schema 2020-12 representation used by non-TypeScript consumers.

The built package publishes that representation as `agent-schema-1.0.0.json`.

## Snapshot structure

Every snapshot requires `schemaVersion`, `agentId`, and all semantic section containers:

- `identity`: display name and aliases.
- `biography`: profession, employer, nationality, sex, age, date of birth, education, and formatted physical description.
- `statistics`: the six primary statistics and their distinguishing features.
- `resources`: current and reference HP, WP, SAN, Breaking Point, wounds, exhaustion, and first-aid state.
- `skills`: Standard Skills, Custom Skills, and Special Training as distinct concepts.
- `relationships`: Bonds and their mutable scores/damage state.
- `psychology`: Motivations, Disorders, Adaptation Evidence, and traumatic background.
- `inventory`: distinct weapon, armor, gear, ritual, and tome collections.
- `notes`: player-visible and Handler-only formatted narrative.
- `campaignState`: typed optional campaign-framework data, initially Impossible Landscapes.
- `provenance`: compact adapter/source identity and content hash.
- `extensions`: namespaced JSON fragments that avoid source-data loss without making source fields canonical.

A Draft Agent keeps these containers but may omit optional leaf values and use empty collections. Unknown properties are rejected at every canonical object boundary. Adapters must either map a value canonically or retain it under their extension namespace.

## Identity and references

`agentId` and every repeated semantic entry use lowercase UUID v4 values. Names and array positions are never identity. UUIDs must be unique across the snapshot. Motivation-to-Disorder and Special-Training-to-Custom-Skill references must resolve within the same snapshot.

Adapters generate new IDs with `crypto.randomUUID()` and preserve existing canonical IDs on subsequent round trips.

## Completeness and unusual values

Completeness is derived rather than stored:

- `red`: missing mathematical inputs, missing Standard Skills, duplicate canonical IDs, or dangling canonical references.
- `amber`: mathematically usable but missing lower-priority play information such as name or profession.
- `green`: no completeness-impacting diagnostics.

Explicit unusual game values remain representable. For example, a current resource above its maximum produces a warning but is not clamped or replaced. Source coercion, normalization, formula derivation, and conflict reporting belong to adapters or the validation package, not this strict canonical parser.

## Narrative and secrecy

Narrative values declare `plain`, `markdown`, or `html` format. Handler notes are structurally separate from player notes. Ritual and tome Handler content also carries an explicit `revealed` state; renderers must not expose unrevealed content to players.
