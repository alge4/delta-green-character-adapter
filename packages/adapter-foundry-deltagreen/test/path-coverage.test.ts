import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { parseMappingInventory } from "@delta-green-character-adapter/adapter-core";
import { parseAgentSnapshot } from "@delta-green-character-adapter/character-model";

import { FOUNDRY_IMPORT_INVENTORY_PATH, importFoundryDeltaGreen } from "../src/index.js";
import { ITEM_SYSTEM_FIELDS, ITEM_CORE_KEYS, MAPPED_ITEM_TYPE_SET } from "../src/maps.js";
import {
  asSnapshot,
  BLANK_ACTOR,
  foundryPartition,
  LIVE_GEORGE,
  LIVE_STANDARD,
  readFoundryFixture,
  readFoundryFixtureBytes,
  repoRoot,
  sequentialIdFactory,
  syntheticFixtureNames,
} from "./helpers.js";

const BLOCKING_SYNTHETICS = new Set([
  "f8a-root-not-object.json",
  "f8b-non-agent-type.json",
  "f8c-system-missing.json",
  "f8d-statistic-missing.json",
  "f8e-wrong-system-id.json",
]);

// The inventory closes over unmapped persisted state with these two catch-alls. They are
// excluded from the classification set so that anything they would cover has to show up in
// extensions.foundry.raw rather than disappearing.
const CATCH_ALL_SOURCES = new Set(["system.*", "items[type=*]"]);

function collectPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return prefix ? [prefix] : [];
  }
  if (Array.isArray(value)) {
    const paths = prefix ? [prefix] : [];
    for (const [index, entry] of value.entries()) {
      paths.push(...collectPaths(entry, `${prefix}[${index}]`));
    }
    return paths;
  }
  const paths = prefix ? [prefix] : [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    paths.push(...collectPaths(entry, prefix ? `${prefix}.${key}` : key));
  }
  return paths;
}

function segmentPattern(segment: string): string {
  if (segment === "*" || /^<[^>]+>$/.test(segment)) {
    return "[^.]+";
  }
  if (segment.endsWith("[]")) {
    return `${segment.slice(0, -2).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\[\\])?`;
  }
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rowMatchers(source: string): RegExp[] {
  const segments = source.split(".");
  const matchers: RegExp[] = [];
  for (let length = 1; length <= segments.length; length += 1) {
    matchers.push(new RegExp(`^${segments.slice(0, length).map(segmentPattern).join("\\.")}$`));
  }
  return matchers;
}

function ancestorsOf(path: string): string[] {
  const segments = path.split(".");
  return segments.map((_segment, index) => segments.slice(0, index + 1).join("."));
}

function isClassifiedBySource(path: string, source: string): boolean {
  const matchers = rowMatchers(source);
  const full = matchers[matchers.length - 1]!;
  // Either the path (or one of its ancestors) sits inside the mapped subtree, or the path is
  // a container on the way down to it.
  return (
    ancestorsOf(path).some((ancestor) => full.test(ancestor)) ||
    matchers.some((matcher) => matcher.test(path))
  );
}

function isCoveredByRaw(path: string, rawKeys: readonly string[]): boolean {
  return rawKeys.some(
    (key) => path === key || path.startsWith(`${key}.`) || path.startsWith(`${key}[`),
  );
}

describe("silent-drop path coverage gate for Foundry import (#25)", () => {
  it("classifies or preserves every authoritative path in the non-blocking fixtures", () => {
    const inventory = parseMappingInventory(
      JSON.parse(readFileSync(resolve(repoRoot, FOUNDRY_IMPORT_INVENTORY_PATH), "utf8")),
    );
    const classifyingSources = inventory.paths
      .map((entry) => entry.source)
      .filter((source): source is string => source !== undefined && !CATCH_ALL_SOURCES.has(source))
      .filter((source) => !source.startsWith("items["));
    const preparedIgnore = (inventory as unknown as { preparedIgnore?: string[] }).preparedIgnore ?? [];
    assert.ok(preparedIgnore.length > 0);
    const sources = [...classifyingSources, ...preparedIgnore];

    const fixtures = [
      BLANK_ACTOR,
      LIVE_GEORGE,
      LIVE_STANDARD,
      ...syntheticFixtureNames()
        .filter((name) => !BLOCKING_SYNTHETICS.has(name))
        .map((name) => `synthetic/${name}`),
    ];

    const unclassified: string[] = [];
    for (const fixture of fixtures) {
      const actor = readFoundryFixture(fixture) as Record<string, unknown>;
      const snapshot = parseAgentSnapshot(
        asSnapshot(
          importFoundryDeltaGreen(readFoundryFixtureBytes(fixture), {
            createId: sequentialIdFactory(),
          }),
        ),
      );
      const rawKeys = Object.keys(foundryPartition(snapshot, "raw"));
      const items = Array.isArray(actor.items) ? (actor.items as Array<Record<string, unknown>>) : [];

      for (const path of collectPaths(actor)) {
        if (path === "items" || isCoveredByRaw(path, rawKeys)) {
          continue;
        }
        const itemMatch = /^items\[(\d+)\](?:\.(.*))?$/.exec(path);
        if (itemMatch) {
          const [, index, rest] = itemMatch;
          if (rest === undefined) {
            continue;
          }
          const item = items[Number(index)] ?? {};
          const itemType = typeof item.type === "string" ? item.type : "";
          const [head, field] = rest.split(".");
          if (head !== "system") {
            if (ITEM_CORE_KEYS.has(head!)) {
              continue;
            }
          } else if (
            MAPPED_ITEM_TYPE_SET.has(itemType) &&
            (field === undefined ||
              ITEM_SYSTEM_FIELDS[itemType as keyof typeof ITEM_SYSTEM_FIELDS].includes(field))
          ) {
            continue;
          }
          unclassified.push(`${fixture}: ${path}`);
          continue;
        }
        const normalized = path.replace(/\[\d+\]/g, "[]");
        if (sources.some((source) => isClassifiedBySource(normalized, source))) {
          continue;
        }
        unclassified.push(`${fixture}: ${path}`);
      }
    }

    assert.deepEqual(unclassified, [], `Silent drops:\n${unclassified.sort().join("\n")}`);
  });
});
