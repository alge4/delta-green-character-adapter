import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  parseKnownLossManifest,
  parseMappingInventory,
  validateCapabilityEvidence,
} from "@delta-green-character-adapter/adapter-core";

import {
  createGreenAgentCreatorCapability,
  GREEN_INVENTORY_PATH,
  GREEN_KNOWN_LOSS_PATH,
} from "../src/index.js";
import { fixtureRoot, repoRoot } from "./helpers.js";

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

function checksum(relativePath: string): string {
  const digest = createHash("sha256")
    .update(readFileSync(resolve(repoRoot, relativePath)))
    .digest("hex");
  return `sha256:${digest}`;
}

describe("Green Agent Creator capability evidence (#8/#24)", () => {
  it("passes validateCapabilityEvidence for inventory, known-loss, fixtures, and tests", () => {
    const syntheticNames = readdirSync(resolve(fixtureRoot, "synthetic")).filter((name) =>
      name.endsWith(".json"),
    );
    const fixtures = [
      "fixtures/green-agent-creator/5c9e92d/caleb.json",
      ...syntheticNames.map((name) => `fixtures/green-agent-creator/5c9e92d/synthetic/${name}`),
    ];
    const tests = [
      "packages/adapter-green-agent-creator/test/import-blocking.test.ts",
      "packages/adapter-green-agent-creator/test/import-caleb.test.ts",
      "packages/adapter-green-agent-creator/test/fixture-matrix.test.ts",
      "packages/adapter-green-agent-creator/test/capability-evidence.test.ts",
      "packages/adapter-green-agent-creator/test/path-coverage.test.ts",
    ];

    const capability = createGreenAgentCreatorCapability({ fixtures, tests });
    const inventory = parseMappingInventory(readJson(GREEN_INVENTORY_PATH));
    const knownLoss = parseKnownLossManifest(readJson(GREEN_KNOWN_LOSS_PATH));
    const presentArtifactPaths = new Set([
      GREEN_INVENTORY_PATH,
      GREEN_KNOWN_LOSS_PATH,
      ...fixtures,
      ...tests,
    ]);

    const result = validateCapabilityEvidence({
      capability,
      inventory,
      knownLoss,
      fixtureManifest: fixtures.map((path) => ({ path, checksum: checksum(path) })),
      presentArtifactPaths,
    });

    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues, null, 2));
  });

  it("agrees SHA256SUMS with on-disk fixture bytes", () => {
    const lines = readFileSync(resolve(fixtureRoot, "SHA256SUMS"), "utf8")
      .trim()
      .split(/\r?\n/);
    assert.ok(lines.length > 1);
    for (const line of lines) {
      const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
      assert.ok(match, `bad checksum line: ${line}`);
      const [, digest, relative] = match;
      const actual = createHash("sha256")
        .update(readFileSync(resolve(fixtureRoot, relative!)))
        .digest("hex");
      assert.equal(actual, digest, relative);
    }
  });
});
