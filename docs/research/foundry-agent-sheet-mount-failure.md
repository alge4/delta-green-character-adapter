# Foundry Agent-sheet mount failure (#37)

## Decision summary

The packaged module fails to show Completeness Assessment and Import controls on live Delta Green Agent sheets because **`registerFoundryModule` listens only for classic Application V1 sheet hooks (`renderActorSheet`, `renderDocumentSheet`), while Delta Green `1.7.0` Agent sheets are `ActorSheetV2` applications that fire ApplicationV2 hooks (`renderActorSheetV2`, `renderDocumentSheetV2`, and the class chain under `renderApplicationV2`)**. Attach never runs, so title-bar chrome is never created.

The narrowest verified corrective seam is **`registerFoundryModule` in `apps/foundry-module/src/foundry/register.ts`**: subscribe to the ApplicationV2 Agent/Document sheet render hooks (keeping eligibility and `mountImportWizardUi` unchanged), then lock the V2 render path with the #37 repro.

## Authorities

- Delta Green `1.7.0` (`7d86f90`): `DGActorSheet` extends `DGSheetMixin(ActorSheetV2)`; default Agent registration uses `DGAgentSheet` ([base actor sheet](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/sheets/base-actor-sheet.js), [system init registration](https://github.com/deltagreen-foundryvtt/delta-green-foundry-vtt-system/blob/7d86f90e1d25d47a316b94e072b14a34ca80366b/module/deltagreen.js)).
- Foundry v14 ApplicationV2 hook contract: render hooks are named `render{ApplicationClass}` for each class in the inheritance chain, e.g. `renderApplicationV2` / `renderActorSheetV2` ([`renderApplicationV2`](https://foundryvtt.com/api/v14/functions/hookEvents.renderApplicationV2.html)).
- Module registration surface: `apps/foundry-module/src/foundry/register.ts` currently hooks only `renderActorSheet` and `renderDocumentSheet`.
- Live host marker: `https://foundry.faux-orator.com/join` reports **Version 14 Build 365** (exact-target core).

## Red-capable feedback loop

Command (from `apps/foundry-module` after `pnpm build`):

```bash
node ./scripts/diagnose-sheet-mount.mjs
```

Observed on this diagnosis (exit code `1`):

```text
subscribed hooks: renderActorSheet, renderDocumentSheet
after renderActorSheetV2 / renderDocumentSheetV2:
  data-dgca-titlebar: MISSING
  Completeness Assessment lamp: MISSING
  Import control: MISSING
control renderActorSheet mount: mounted
DIAGNOSIS: packaged module never hears ApplicationV2 Agent-sheet render hooks; chrome stays unmounted.
```

Automated characterization also lives in `apps/foundry-module/test/register-sheet-mount.test.ts`:

1. Current subscriptions are only the V1 hook names.
2. Firing a subscribed `renderActorSheet` with an exact-target Agent sheet **does** mount Completeness + Import (attach/eligibility/DOM path works).
3. Firing `renderActorSheetV2` / `renderDocumentSheetV2` leaves chrome unmounted (live failure pattern).

## Ruled out by the loop

| Hypothesis | Prediction | Result |
|---|---|---|
| Exact-version eligibility rejects the live sheet | Control `renderActorSheet` with `game.version === "14.365"` / DG `1.7.0` would not mount | Control mounts — eligibility is not the blocker |
| `mountImportWizardUi` / chrome slot selectors broken | Control mount would miss title-bar nodes | Control creates `[data-dgca-titlebar]`, lamp, and Import |
| Packaging omits `registerFoundryModule` | Bundle/package gates would fail independently | Packaging tests already require the bootstrap bundle; diagnose imports the built register entry |
| Wrong window-root selectors for ApplicationV2 | Control uses `.application` + `.window-header` (V2 shape) and still mounts when the hook fires | Selector path works once attach runs |

## Narrowest corrective seam (for #38)

Change **only** the hook subscription / call-site wiring in `registerFoundryModule` so ApplicationV2 Agent-sheet renders invoke the existing `attach` path (prefer `renderActorSheetV2` and/or `renderDocumentSheetV2`; do not broaden to unsupported actor types or versions). Invert the #37 V2 “unmounted” assertion into a positive mount regression once the subscription is corrected. Do not change ADR Variant A UX, eligibility pins, or the Delta Green Stat Block Parser.
