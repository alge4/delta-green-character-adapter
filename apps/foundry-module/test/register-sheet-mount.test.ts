import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { registerFoundryModule } from "../src/foundry/register.js";
import { BLANK_ACTOR, moduleRoot, readFoundryFixture } from "./helpers.js";

/**
 * Minimal DOM for registerFoundryModule attach (#37/#38).
 * Mirrors apps/foundry-module/scripts/dom-shim.mjs for node:test.
 */
class ClassList {
  constructor(private readonly owner: ElementShim) {}
  private tokens = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) {
      this.tokens.add(token);
    }
    this.owner.className = [...this.tokens].join(" ");
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }
}

class ElementShim {
  tagName: string;
  children: ElementShim[] = [];
  parentElement: ElementShim | null = null;
  attributes = new Map<string, string>();
  style: Record<string, string> = {};
  textContent = "";
  className = "";
  classList: ClassList;
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
    this.classList = new ClassList(this);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  append(...nodes: Array<ElementShim | string>): void {
    for (const node of nodes) {
      if (typeof node === "string") {
        this.textContent += node;
        continue;
      }
      node.parentElement = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: Array<ElementShim | string>): void {
    for (const child of this.children) {
      child.parentElement = null;
    }
    this.children = [];
    this.textContent = "";
    this.append(...nodes);
  }

  remove(): void {
    if (!this.parentElement) {
      return;
    }
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  closest(selector: string): ElementShim | null {
    let current: ElementShim | null = this;
    while (current) {
      if (matchesSelector(current, selector)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector: string): ElementShim | null {
    const queue = [...this.children];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (matchesSelector(node, selector)) {
        return node;
      }
      queue.push(...node.children);
    }
    return null;
  }

  addEventListener(type: string, listener: (...args: unknown[]) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
}

function matchesSimple(node: ElementShim, simple: string): boolean {
  const trimmed = simple.trim();
  if (trimmed.startsWith(".")) {
    return node.classList.contains(trimmed.slice(1));
  }
  if (trimmed.startsWith("[")) {
    const contains = /^\[([^=\]]+)\*=['"]([^'"]+)['"]\]$/.exec(trimmed);
    if (contains?.[1] !== undefined && contains[2] !== undefined) {
      const actual = node.getAttribute(contains[1]);
      return actual !== null && actual.includes(contains[2]);
    }
    const match = /^\[([^=\]]+)(?:=['"]?([^'"\]]*)['"]?)?\]$/.exec(trimmed);
    if (match?.[1] === undefined) {
      return false;
    }
    const name = match[1];
    const expected = match[2];
    const actual = node.getAttribute(name);
    return expected === undefined ? actual !== null : actual === expected;
  }
  return node.tagName === trimmed.toUpperCase();
}

function matchesSelector(node: ElementShim, selector: string): boolean {
  return selector
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => {
      const tokens = part.match(/(\.[a-zA-Z0-9_-]+|\[[^\]]+\]|[a-zA-Z][a-zA-Z0-9_-]*)/g) ?? [];
      return tokens.every((token) => matchesSimple(node, token));
    });
}

class HTMLElementShim extends ElementShim {}

function installDom(): void {
  (globalThis as unknown as { HTMLElement: typeof HTMLElementShim }).HTMLElement = HTMLElementShim;
  (globalThis as unknown as { document: { createElement: (tag: string) => HTMLElementShim } }).document =
    {
      createElement(tagName: string) {
        return new HTMLElementShim(tagName);
      },
    };
  (globalThis as unknown as { getComputedStyle: () => { position: string } }).getComputedStyle = () => ({
    position: "static",
  });
}

function createApplicationRoot(): HTMLElementShim {
  const root = new HTMLElementShim("div");
  root.classList.add("application");
  const header = new HTMLElementShim("header");
  header.classList.add("window-header");
  const bio = new HTMLElementShim("div");
  bio.setAttribute("data-tab", "bio");
  root.append(header, bio);
  return root;
}

function createHookBus(): {
  on(event: string, fn: (...args: never[]) => unknown): void;
  emit(event: string, ...args: unknown[]): void;
  subscribed(): string[];
} {
  const listeners = new Map<string, Array<(...args: never[]) => unknown>>();
  return {
    on(event, fn) {
      const list = listeners.get(event) ?? [];
      list.push(fn);
      listeners.set(event, list);
    },
    emit(event, ...args) {
      for (const fn of listeners.get(event) ?? []) {
        (fn as (...inner: unknown[]) => unknown)(...args);
      }
    },
    subscribed() {
      return [...listeners.keys()].sort();
    },
  };
}

function createSheet(root: HTMLElementShim) {
  const source = readFoundryFixture(BLANK_ACTOR);
  return {
    actor: {
      id: "ActorBlank000001",
      type: "agent",
      isOwner: true,
      toObject: () => structuredClone(source),
      update: async () => undefined,
      createEmbeddedDocuments: async () => [],
      deleteEmbeddedDocuments: async () => [],
      updateEmbeddedDocuments: async () => [],
    },
    element: root as unknown as HTMLElement,
  };
}

const exactGame = {
  version: "14.365",
  system: { id: "deltagreen", version: "1.7.0" },
  user: { id: "UserHarness0001", isGM: true },
};

describe("registerFoundryModule Agent-sheet mount (#38)", () => {
  installDom();

  it("registers classic and ApplicationV2 Agent-sheet hooks in the Foundry bootstrap source", () => {
    // Assert source (not artifact/main.js): packaging.test.ts rmSync's the artifact in parallel.
    // Packaged main.js hook surface is covered by scripts/diagnose-sheet-mount.mjs.
    const source = readFileSync(resolve(moduleRoot, "src/foundry/register.ts"), "utf8");
    assert.match(source, /"renderActorSheet"/);
    assert.match(source, /"renderDocumentSheet"/);
    assert.match(source, /"renderActorSheetV2"/);
    assert.match(source, /"renderDocumentSheetV2"/);
  });

  it("subscribes to classic and ApplicationV2 Agent-sheet render hooks", () => {
    const hooks = createHookBus();
    registerFoundryModule({
      hooks,
      getGame: () => exactGame,
    });
    assert.deepEqual(hooks.subscribed(), [
      "renderActorSheet",
      "renderActorSheetV2",
      "renderDocumentSheet",
      "renderDocumentSheetV2",
    ]);
  });

  it("mounts Completeness + Import when a subscribed classic renderActorSheet fires", async () => {
    const hooks = createHookBus();
    registerFoundryModule({
      hooks,
      getGame: () => exactGame,
      adapterVersion: "0.0.0",
    });
    const root = createApplicationRoot();
    hooks.emit("renderActorSheet", createSheet(root));

    const titleBar = await waitFor(
      () => root.querySelector("[data-dgca-titlebar]"),
      (node) => node !== null && node.querySelector("button") !== null,
    );
    assert.ok(titleBar, "title-bar chrome slot should be created");
    assert.ok(
      titleBar.querySelector('[aria-label*="Completeness Assessment"]'),
      "Completeness Assessment lamp should mount",
    );
    const importButton = titleBar.querySelector("button");
    assert.ok(importButton, "Import control should mount");
    assert.match(importButton.textContent, /Import/);
  });

  it("mounts Completeness + Import when ApplicationV2 Agent-sheet hooks fire", async () => {
    const hooks = createHookBus();
    registerFoundryModule({
      hooks,
      getGame: () => exactGame,
      adapterVersion: "0.0.0",
    });
    const root = createApplicationRoot();
    const sheet = createSheet(root);

    // Delta Green 1.7.0 Agent sheet extends ActorSheetV2 — these are the live hooks.
    hooks.emit("renderActorSheetV2", sheet, root, {}, {});

    const titleBar = await waitFor(
      () => root.querySelector("[data-dgca-titlebar]"),
      (node) => node !== null && node.querySelector("button") !== null,
    );
    assert.ok(titleBar, "title-bar chrome slot should be created on V2 render");
    assert.ok(
      titleBar.querySelector('[aria-label*="Completeness Assessment"]'),
      "Completeness Assessment lamp should mount on V2 render",
    );
    const importButton = titleBar.querySelector("button");
    assert.ok(importButton, "Import control should mount on V2 render");
    assert.match(importButton.textContent, /Import/);
  });

  it("mounts Completeness + Import when renderDocumentSheetV2 fires", async () => {
    const hooks = createHookBus();
    registerFoundryModule({
      hooks,
      getGame: () => exactGame,
      adapterVersion: "0.0.0",
    });
    const root = createApplicationRoot();
    hooks.emit("renderDocumentSheetV2", createSheet(root), root, {}, {});

    const titleBar = await waitFor(
      () => root.querySelector("[data-dgca-titlebar]"),
      (node) => node !== null && node.querySelector("button") !== null,
    );
    assert.ok(titleBar, "title-bar chrome slot should be created on DocumentSheetV2 render");
    assert.ok(
      titleBar.querySelector('[aria-label*="Completeness Assessment"]'),
      "Completeness Assessment lamp should mount on DocumentSheetV2 render",
    );
    const importButton = titleBar.querySelector("button");
    assert.ok(importButton, "Import control should mount on DocumentSheetV2 render");
    assert.match(importButton.textContent, /Import/);
  });
});

async function waitFor<T>(
  read: () => T,
  ready: (value: T) => boolean,
  timeoutMs = 1000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (ready(value)) {
      return value;
    }
    if (Date.now() - start > timeoutMs) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
