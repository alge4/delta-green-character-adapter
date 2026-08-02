import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseCapabilityRecord,
  parseKnownLossManifest,
  parseMappingInventory,
  validateCapabilityEvidence,
  type CapabilityRecord,
} from "../src/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

const greenInventoryPath = "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/inventory.json";
const greenKnownLossPath = "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/known-loss.json";
const foundryImportInventoryPath =
  "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/inventory.json";
const foundryImportKnownLossPath =
  "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/known-loss.json";
const foundryExportInventoryPath =
  "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/inventory.json";
const foundryExportKnownLossPath =
  "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/known-loss.json";

function greenCapability(overrides: Partial<CapabilityRecord> = {}): CapabilityRecord {
  return parseCapabilityRecord({
    id: "green-agent-creator-5c9e92d-to-canonical-1.0.0",
    adapterId: "green-agent-creator-import",
    adapterVersion: "0.0.0",
    direction: "import",
    source: {
      format: "green-agent-creator",
      version: "5c9e92d",
      commit: "5c9e92d987f1251d62c172209fc53f8e8ac3372b",
    },
    canonical: { schema: "canonical-agent", version: "1.0.0" },
    fidelityClass: "lossy-semantic",
    knownExclusions: ["canonical-to-green-export"],
    evidence: {
      inventory: greenInventoryPath,
      knownLoss: greenKnownLossPath,
      fixtures: ["fixtures/green/caleb.json"],
      tests: ["packages/adapter-green-agent-creator/test/import.test.ts"],
    },
    ...overrides,
  });
}

describe("directed capability records", () => {
  it("requires exact adapter, direction, source, canonical, and fidelity identity", () => {
    const capability = greenCapability();
    assert.equal(capability.direction, "import");
    assert.equal(capability.source.version, "5c9e92d");
    assert.equal(capability.canonical.version, "1.0.0");
    assert.equal(capability.fidelityClass, "lossy-semantic");
  });

  it("parses the three initial mapping inventories and known-loss manifests", () => {
    for (const [inventoryPath, knownLossPath] of [
      [greenInventoryPath, greenKnownLossPath],
      [foundryImportInventoryPath, foundryImportKnownLossPath],
      [foundryExportInventoryPath, foundryExportKnownLossPath],
    ] as const) {
      const inventory = parseMappingInventory(readJson(inventoryPath));
      const knownLoss = parseKnownLossManifest(readJson(knownLossPath));
      assert.equal(knownLoss.capability, inventory.capability.id);
      assert.equal(knownLoss.fidelityClass, inventory.capability.fidelityClass);
      assert.ok(inventory.paths.length > 0);
      assert.ok(knownLoss.losses.length > 0);
    }
  });
});

describe("capability evidence validation", () => {
  it("accepts agreeing inventory, known-loss, fixtures, and evidence", () => {
    const capability = greenCapability();
    const result = validateCapabilityEvidence({
      capability,
      inventory: parseMappingInventory(readJson(greenInventoryPath)),
      knownLoss: parseKnownLossManifest(readJson(greenKnownLossPath)),
      fixtureManifest: [
        {
          path: "fixtures/green/caleb.json",
          checksum: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        },
      ],
      presentArtifactPaths: new Set([
        greenInventoryPath,
        greenKnownLossPath,
        "fixtures/green/caleb.json",
        "packages/adapter-green-agent-creator/test/import.test.ts",
      ]),
    });
    assert.deepEqual(result, { ok: true });
  });

  it("rejects advertised capabilities when versions, inventory, known-loss, fixtures, or evidence disagree", () => {
    const capability = greenCapability({
      source: {
        format: "green-agent-creator",
        version: "deadbeef",
        commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
    });
    const mismatched = validateCapabilityEvidence({
      capability,
      inventory: parseMappingInventory(readJson(greenInventoryPath)),
      knownLoss: parseKnownLossManifest(readJson(greenKnownLossPath)),
      fixtureManifest: [],
      presentArtifactPaths: new Set([greenInventoryPath, greenKnownLossPath]),
    });
    assert.equal(mismatched.ok, false);
    if (!mismatched.ok) {
      const codes = mismatched.issues.map((issue) => issue.code);
      assert.ok(codes.includes("capability.inventory.version-mismatch"));
      assert.ok(codes.includes("capability.evidence.artifact-missing"));
      assert.ok(codes.includes("capability.evidence.fixture-checksum-missing"));
    }

    const lossyWithoutManifest = validateCapabilityEvidence({
      capability: greenCapability({
        evidence: {
          inventory: greenInventoryPath,
          fixtures: [],
          tests: ["packages/adapter-green-agent-creator/test/import.test.ts"],
        },
      }),
      inventory: parseMappingInventory(readJson(greenInventoryPath)),
      fixtureManifest: [],
      presentArtifactPaths: new Set([
        greenInventoryPath,
        "packages/adapter-green-agent-creator/test/import.test.ts",
      ]),
    });
    assert.equal(lossyWithoutManifest.ok, false);
    if (!lossyWithoutManifest.ok) {
      assert.ok(
        lossyWithoutManifest.issues.some(
          (issue) =>
            issue.code === "capability.known-loss.missing" ||
            issue.code === "capability.evidence.known-loss-missing",
        ),
      );
    }
  });
});
