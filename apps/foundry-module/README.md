# Foundry module apply/recovery bridge

`@delta-green-character-adapter/foundry-module` is a thin exact-runtime bridge that applies a validated Update Plan to a Foundry Actor (#7, #10, #27).

Mapping and planning stay in packages; the Foundry UI is separate (#28).

## Public seams

- **`FoundryActorRuntime` / `FoundryWorldRuntime`** — injectable ports (no Foundry globals in this package).

Apply, create, recovery, and the failure-injection harness land in follow-on commits for #27.
