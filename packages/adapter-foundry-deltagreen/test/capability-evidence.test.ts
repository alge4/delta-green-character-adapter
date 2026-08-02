import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  parseKnownLossManifest,
  parseMappingInventory,
  validateCapabilityEvidence,
} from "@delta-green-character-adapter/adapter-core";

import {
  CANONICAL_EXPORT_FIXTURE_ROOT,
  createFoundryDeltaGreenExportCapability,
  createFoundryDeltaGreenImportCapability,
  FOUNDRY_EXPORT_INVENTORY_PATH,
  FOUNDRY_EXPORT_KNOWN_LOSS_PATH,
  FOUNDRY_FIXTURE_ROOT,
  FOUNDRY_IMPORT_INVENTORY_PATH,
  FOUNDRY_IMPORT_KNOWN_LOSS_PATH,
} from "../src/index.js";
import {
  BLANK_ACTOR,
  canonicalFixtureNames,
  canonicalFixtureRoot,
  foundryFixtureRoot,
  LIVE_GEORGE,
  LIVE_STANDARD,
  liveApplyFixtureNames,
  repoRoot,
  syntheticFixtureNames,
} from "./helpers.js";

const TEST_ROOT = "packages/adapter-foundry-deltagreen/test";
const TESTS = [
  `${TEST_ROOT}/import-blank.test.ts`,
  `${TEST_ROOT}/import-blocking.test.ts`,
  `${TEST_ROOT}/import-fixture-matrix.test.ts`,
  `${TEST_ROOT}/export-fixture-matrix.test.ts`,
  `${TEST_ROOT}/round-trip.test.ts`,
  `${TEST_ROOT}/capability-evidence.test.ts`,
  `${TEST_ROOT}/path-coverage.test.ts`,
  "apps/foundry-module/test/live-apply.test.ts",
];

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

function checksum(relativePath: string): string {
  const digest = createHash("sha256")
    .update(readFileSync(resolve(repoRoot, relativePath)))
    .digest("hex");
  return `sha256:${digest}`;
}

function verifyChecksumFile(root: string): number {
  const lines = readFileSync(resolve(root, "SHA256SUMS"), "utf8").trim().split(/\r?\n/);
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    assert.ok(match, `bad checksum line: ${line}`);
    const [, digest, relative] = match;
    const actual = createHash("sha256").update(readFileSync(resolve(root, relative!))).digest("hex");
    assert.equal(actual, digest, relative);
  }
  return lines.length;
}

describe("Foundry Delta Green capability evidence (#25/#29)", () => {
  const liveApplyFixtures = liveApplyFixtureNames().map(
    (name) => `${FOUNDRY_FIXTURE_ROOT}/live-apply/${name}`,
  );
  const importFixtures = [
    `${FOUNDRY_FIXTURE_ROOT}/${BLANK_ACTOR}`,
    `${FOUNDRY_FIXTURE_ROOT}/${LIVE_GEORGE}`,
    `${FOUNDRY_FIXTURE_ROOT}/${LIVE_STANDARD}`,
    ...syntheticFixtureNames().map((name) => `${FOUNDRY_FIXTURE_ROOT}/synthetic/${name}`),
    ...liveApplyFixtures,
  ];
  const exportFixtures = [
    ...canonicalFixtureNames().map((name) => `${CANONICAL_EXPORT_FIXTURE_ROOT}/${name}`),
    ...liveApplyFixtures,
  ];

  it("passes validateCapabilityEvidence for the import capability", () => {
    const capability = createFoundryDeltaGreenImportCapability({
      fixtures: importFixtures,
      tests: TESTS,
    });
    const result = validateCapabilityEvidence({
      capability,
      inventory: parseMappingInventory(readJson(FOUNDRY_IMPORT_INVENTORY_PATH)),
      knownLoss: parseKnownLossManifest(readJson(FOUNDRY_IMPORT_KNOWN_LOSS_PATH)),
      fixtureManifest: importFixtures.map((path) => ({ path, checksum: checksum(path) })),
      presentArtifactPaths: new Set([
        FOUNDRY_IMPORT_INVENTORY_PATH,
        FOUNDRY_IMPORT_KNOWN_LOSS_PATH,
        ...importFixtures,
        ...TESTS,
      ]),
    });
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues, null, 2));
  });

  it("passes validateCapabilityEvidence for the export capability", () => {
    const capability = createFoundryDeltaGreenExportCapability({
      fixtures: exportFixtures,
      tests: TESTS,
    });
    const result = validateCapabilityEvidence({
      capability,
      inventory: parseMappingInventory(readJson(FOUNDRY_EXPORT_INVENTORY_PATH)),
      knownLoss: parseKnownLossManifest(readJson(FOUNDRY_EXPORT_KNOWN_LOSS_PATH)),
      fixtureManifest: exportFixtures.map((path) => ({ path, checksum: checksum(path) })),
      presentArtifactPaths: new Set([
        FOUNDRY_EXPORT_INVENTORY_PATH,
        FOUNDRY_EXPORT_KNOWN_LOSS_PATH,
        ...exportFixtures,
        ...TESTS,
      ]),
    });
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues, null, 2));
  });

  it("agrees SHA256SUMS with the on-disk bytes of every advertised fixture", () => {
    assert.equal(verifyChecksumFile(foundryFixtureRoot), importFixtures.length);
    assert.equal(
      verifyChecksumFile(canonicalFixtureRoot),
      canonicalFixtureNames().length,
    );
    for (const path of liveApplyFixtures) {
      assert.ok(
        importFixtures.includes(path) && exportFixtures.includes(path),
        `live-apply fixture must be advertised for both capabilities: ${path}`,
      );
    }
  });

  it("keeps the pinned upstream Actor bytes unchanged", () => {
    assert.equal(
      checksum(`${FOUNDRY_FIXTURE_ROOT}/${BLANK_ACTOR}`).slice(7, 15),
      "f7a37b64",
    );
    assert.equal(
      checksum(`${FOUNDRY_FIXTURE_ROOT}/${LIVE_GEORGE}`).slice(7, 15),
      "7e11f76b",
    );
  });
});
