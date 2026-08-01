# Delta Green Character Interchange

This context defines the source-independent language used to represent and exchange playable Delta Green characters across adapters and renderers.

## Characters and state

**Agent**:
A playable Delta Green character. Canonical schema 1.0.0 covers Agents; NPCs and vehicles are distinct future character models.
_Avoid_: Actor, player character, character record

**Agent Snapshot**:
A complete point-in-time representation of an Agent, including enduring profile and capability data plus current campaign state.
_Avoid_: Character template, baseline sheet

**Draft Agent**:
An Agent Snapshot that is structurally readable but lacks information needed for mathematical completeness or normal play.
_Avoid_: Invalid Agent, broken character

**Mutable Campaign State**:
Agent data changed through play, such as current resources, bond damage, adaptations, disorders, wounds, and skill-failure marks.
_Avoid_: Profile data, defaults

**Completeness Assessment**:
A derived green, amber, or red evaluation of an Agent Snapshot: complete, playable with lower-priority omissions, or mathematically incomplete. It is determined by diagnostic completeness impact, independently of diagnostic severity.
_Avoid_: Status flag, validity flag

## Character capabilities

**Standard Skill**:
A skill defined by the Delta Green rules with a canonical identifier and proficiency.
_Avoid_: Built-in skill, ordinary skill

**Custom Skill**:
A user-specialized skill with its own stable identity, group, label, and proficiency.
_Avoid_: Typed skill

**Special Training**:
Training that permits a particular statistic or skill to be used for a named task outside ordinary skill coverage.
_Avoid_: Custom skill, specialization

**Adaptation Evidence**:
Known Violence or Helplessness incident marks and adaptation status, without inventing missing incident history.
_Avoid_: Adaptation flag

## Interchange boundaries

**Canonical Agent**:
The strict, normalized, source-independent Agent Snapshot described by a specific canonical schema version.
_Avoid_: Foundry Actor, builder JSON

**Provenance**:
Compact facts identifying the adapter, source format/version, source record, and content hash from which an Agent Snapshot was produced.
_Avoid_: Raw source payload

**Adapter Extension**:
Namespaced source-specific fragments retained because they have no established canonical meaning.
_Avoid_: Miscellaneous fields, canonical data

**Handler-only Content**:
Secret Agent data retained canonically but excluded from player-visible output unless explicitly revealed.
_Avoid_: Hidden text, private notes

**Campaign State**:
Optional, explicitly modeled data belonging to a recognized campaign framework, such as Impossible Landscapes Corruption, Gift, Insight, and Yellow Sign state.
_Avoid_: Adapter extension

## Foundry updates

**Actor Binding**:
An explicit association between a canonical `agentId` and one Foundry Agent Actor. A name match may propose a binding but never establishes one automatically.
_Avoid_: Name match, Actor lookup

**Update Plan**:
An immutable, previewable set of dependency-aware changes proposed for one bound Foundry Actor from one canonical Agent Snapshot.
_Avoid_: Import result, patch
