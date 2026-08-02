/**
 * Regression feedback loop for #38: ApplicationV2 Agent-sheet mount.
 *
 * Simulates the exact Foundry 14.365 + Delta Green 1.7.0 sheet path:
 * DGAgentSheet extends ActorSheetV2, which fires ApplicationV2 hooks
 * (renderActorSheetV2 / renderDocumentSheetV2).
 *
 * Exit 1 = chrome missing after V2 render.
 * Exit 0 = Completeness Assessment + Import controls mounted.
 *
 * Usage (from apps/foundry-module after build):
 *   node ./scripts/diagnose-sheet-mount.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createApplicationRoot, installDomShim } from "./dom-shim.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(rootDir, "../..");
const blankPath = resolve(
  repoRoot,
  "fixtures/foundry/14.365-deltagreen-1.7.0/fvtt-Actor-blank-GZGftVGSKSRNSREr.json",
);

const artifactMain = resolve(rootDir, "artifact/delta-green-character-adapter/main.js");
const bundled = readFileSync(artifactMain, "utf8");
const bundleHasV1 =
  bundled.includes('"renderActorSheet"') || bundled.includes("'renderActorSheet'");
const bundleHasV2 =
  bundled.includes('"renderActorSheetV2"') || bundled.includes("'renderActorSheetV2'");
console.log("packaged main.js renderActorSheet:", bundleHasV1 ? "present" : "MISSING");
console.log("packaged main.js renderActorSheetV2:", bundleHasV2 ? "present" : "MISSING");
if (!bundleHasV1 || !bundleHasV2) {
  console.log(
    "DIAGNOSIS: packaged bootstrap hook surface unexpected; aborting call-site simulation.",
  );
  process.exit(2);
}

installDomShim();

const { registerFoundryModule } = await import("../dist/foundry/register.js");

const blankSource = JSON.parse(readFileSync(blankPath, "utf8"));

function createHookBus() {
  /** @type {Map<string, Array<(...args: never[]) => unknown>>} */
  const listeners = new Map();
  return {
    on(event, fn) {
      const list = listeners.get(event) ?? [];
      list.push(fn);
      listeners.set(event, list);
    },
    once() {
      /* unused */
    },
    emit(event, ...args) {
      for (const fn of listeners.get(event) ?? []) {
        fn(...args);
      }
    },
    subscribed() {
      return [...listeners.keys()].sort();
    },
  };
}

function createSheet(root) {
  const actor = {
    id: "ActorBlank000001",
    type: "agent",
    isOwner: true,
    toObject() {
      return structuredClone(blankSource);
    },
    async update() {
      return this;
    },
    async createEmbeddedDocuments() {
      return [];
    },
    async deleteEmbeddedDocuments() {
      return [];
    },
    async updateEmbeddedDocuments() {
      return [];
    },
  };
  return {
    actor,
    element: root,
    document: { documentName: "Actor" },
  };
}

const hooks = createHookBus();
const game = {
  version: "14.365",
  system: { id: "deltagreen", version: "1.7.0" },
  user: { id: "UserHarness0001", isGM: true },
};

registerFoundryModule({
  hooks,
  getGame: () => game,
  adapterVersion: "0.0.0",
});

const { root } = createApplicationRoot();
const sheet = createSheet(root);

console.log("subscribed hooks:", hooks.subscribed().join(", ") || "(none)");

async function waitForChrome(hostRoot, timeoutMs = 1000) {
  const start = Date.now();
  for (;;) {
    const titleBar = hostRoot.querySelector("[data-dgca-titlebar]");
    const lamp = titleBar?.querySelector?.('[aria-label*="Completeness Assessment"]');
    const importButton = titleBar?.querySelector?.("button");
    const mounted =
      titleBar !== null &&
      lamp !== null &&
      importButton !== null &&
      String(importButton.textContent ?? "").includes("Import");
    if (mounted || Date.now() - start > timeoutMs) {
      return { titleBar, lamp, importButton, mounted };
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// Exact live path: ApplicationV2 Actor sheet render (Delta Green 1.7.0 Agent sheet).
hooks.emit("renderActorSheetV2", sheet, root, {}, {});
hooks.emit("renderDocumentSheetV2", sheet, root, {}, {});

const v2 = await waitForChrome(root);

console.log("after renderActorSheetV2 / renderDocumentSheetV2:");
console.log("  data-dgca-titlebar:", v2.titleBar ? "present" : "MISSING");
console.log("  Completeness Assessment lamp:", v2.lamp ? "present" : "MISSING");
console.log(
  "  Import control:",
  v2.importButton ? `present (${v2.importButton.textContent})` : "MISSING",
);

if (!v2.mounted) {
  // Control: prove attach logic works when a subscribed V1-style hook fires.
  const control = createApplicationRoot();
  const controlSheet = createSheet(control.root);
  hooks.emit("renderActorSheet", controlSheet);
  const controlResult = await waitForChrome(control.root);
  console.log("control renderActorSheet mount:", controlResult.mounted ? "mounted" : "FAILED");
  console.log(
    "DIAGNOSIS: packaged module never hears ApplicationV2 Agent-sheet render hooks; chrome stays unmounted.",
  );
  process.exit(1);
}

console.log("OK: ApplicationV2 Agent-sheet render mounted Completeness + Import chrome.");
process.exit(0);
