# Canonical Agent validation

`@delta-green-character-adapter/validation` evaluates cross-field invariants and derives the Completeness Assessment for an already parsed canonical Agent Snapshot.

Structural parsing remains owned by `@delta-green-character-adapter/character-model`. This package never coerces, clamps, derives, or mutates snapshot values. Diagnostics have independent severity and completeness impact so an unusual but representable value may warn without making an Agent incomplete.
