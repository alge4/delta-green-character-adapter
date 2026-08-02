import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { parseMappingInventory, type MappingInventory } from "@delta-green-character-adapter/adapter-core";

import { GREEN_INVENTORY_PATH } from "../src/index.js";
import { fixtureRoot, repoRoot } from "./helpers.js";

type InventoryPath = MappingInventory["paths"][number];

function collectPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return prefix ? [prefix] : [];
  }
  if (Array.isArray(value)) {
    const paths = prefix ? [prefix] : [];
    for (const [index, entry] of value.entries()) {
      paths.push(...collectPaths(entry, prefix ? `${prefix}[${index}]` : `[${index}]`));
    }
    return paths;
  }
  const record = value as Record<string, unknown>;
  const paths = prefix ? [prefix] : [];
  for (const [key, entry] of Object.entries(record)) {
    const next = prefix ? `${prefix}.${key}` : key;
    paths.push(...collectPaths(entry, next));
  }
  return paths;
}

function normalizeForInventory(path: string): string[] {
  const candidates = new Set<string>([path]);
  candidates.add(path.replace(/\[\d+\]/g, "[]"));
  const segments = path.replace(/\[\d+\]/g, "[]").split(".");
  for (let i = 0; i < segments.length; i += 1) {
    const wildcard = [...segments.slice(0, i), "*"].join(".");
    candidates.add(wildcard);
    if (i === 0) {
      candidates.add("*");
    }
  }
  // skills[key=unarmed_combat]
  const skillKey = /^skills\[\d+\]\.key$/.exec(path);
  if (skillKey) {
    candidates.add("skills[].key");
  }
  if (/^skills\[\d+\]$/.test(path.replace(/\[\d+\]/g, "[]")) || path.startsWith("skills[")) {
    candidates.add("skills");
    candidates.add("skills[]");
  }
  return [...candidates];
}

function ancestors(path: string): string[] {
  const normalized = path.replace(/\[\d+\]/g, "[]");
  const parts: string[] = [];
  let current = "";
  for (const segment of normalized.split(".")) {
    current = current ? `${current}.${segment}` : segment;
    parts.push(current);
    // Also strip trailing [] containers for matching `bonds` when path is bonds[].description
    if (current.endsWith("[]")) {
      parts.push(current.slice(0, -2));
    }
  }
  return parts;
}

function isClassified(path: string, inventoryPaths: readonly InventoryPath[]): boolean {
  const candidates = new Set([...normalizeForInventory(path), ...ancestors(path)]);
  return inventoryPaths.some((entry) => {
    if (!entry.source) {
      return false;
    }
    if (candidates.has(entry.source)) {
      return true;
    }
    if (entry.source.endsWith(".*")) {
      const root = entry.source.slice(0, -2);
      return [...candidates].some((candidate) => candidate.startsWith(`${root}.`) || candidate === root);
    }
    return false;
  });
}

describe("silent-drop path coverage gate (#24)", () => {
  it("classifies every authoritative path exercised by non-blocking fixtures", () => {
    const inventory = parseMappingInventory(
      JSON.parse(readFileSync(resolve(repoRoot, GREEN_INVENTORY_PATH), "utf8")),
    );
    const fixtureFiles = [
      "caleb.json",
      ...readdirSync(resolve(fixtureRoot, "synthetic"))
        .filter((name) => name.endsWith(".json") && !name.startsWith("f8e") && !name.startsWith("f8f") && !name.startsWith("f8g") && !name.startsWith("f8h"))
        .map((name) => `synthetic/${name}`),
    ];

    const unclassified = new Set<string>();
    for (const file of fixtureFiles) {
      const payload = JSON.parse(readFileSync(resolve(fixtureRoot, file), "utf8")) as unknown;
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        continue;
      }
      for (const path of collectPaths(payload)) {
        // Leaf and container paths both need a home in the inventory classification set.
        if (!isClassified(path, inventory.paths)) {
          unclassified.add(`${file}: ${path}`);
        }
      }
    }

    assert.equal(unclassified.size, 0, `Unclassified authoritative paths:\n${[...unclassified].sort().join("\n")}`);
  });
});
