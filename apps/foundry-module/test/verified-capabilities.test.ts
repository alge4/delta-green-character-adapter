import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  parseKnownLossManifest,
  parseMappingInventory,
  parseVerifiedCapabilityRegistry,
  validateVerifiedCapabilityRegistry,
  VERIFIED_INITIAL_CAPABILITY_IDS,
  type CapabilityEvidenceBundle,
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
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import {
  createGreenAgentCreatorCapability,
  GREEN_FIXTURE_ROOT,
  GREEN_INVENTORY_PATH,
  GREEN_KNOWN_LOSS_PATH,
} from "@delta-green-character-adapter/adapter-green-agent-creator";

import { repoRoot } from "./helpers.js";

const REGISTRY_PATH = "docs/mappings/verified-capabilities.json";

const GREEN_TESTS = [
  "packages/adapter-green-agent-creator/test/import-blocking.test.ts",
  "packages/adapter-green-agent-creator/test/import-caleb.test.ts",
  "packages/adapter-green-agent-creator/test/fixture-matrix.test.ts",
  "packages/adapter-green-agent-creator/test/capability-evidence.test.ts",
  "packages/adapter-green-agent-creator/test/path-coverage.test.ts",
] as const;

const FOUNDRY_TESTS = [
  "packages/adapter-foundry-deltagreen/test/import-blank.test.ts",
  "packages/adapter-foundry-deltagreen/test/import-blocking.test.ts",
  "packages/adapter-foundry-deltagreen/test/import-fixture-matrix.test.ts",
  "packages/adapter-foundry-deltagreen/test/export-fixture-matrix.test.ts",
  "packages/adapter-foundry-deltagreen/test/round-trip.test.ts",
  "packages/adapter-foundry-deltagreen/test/capability-evidence.test.ts",
  "packages/adapter-foundry-deltagreen/test/path-coverage.test.ts",
  "apps/foundry-module/test/create.test.ts",
  "apps/foundry-module/test/merge.test.ts",
  "apps/foundry-module/test/live-apply.test.ts",
  "apps/foundry-module/test/packaging.test.ts",
  "apps/foundry-module/test/verified-capabilities.test.ts",
  "apps/foundry-module/test/wizard-session.test.ts",
  "apps/foundry-module/test/browser/import-wizard.spec.ts",
] as const;

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), "utf8"));
}

function checksum(relativePath: string): string {
  const digest = createHash("sha256")
    .update(readFileSync(resolve(repoRoot, relativePath)))
    .digest("hex");
  return `sha256:${digest}`;
}

function listJsonFiles(absoluteDir: string, relativePrefix: string): string[] {
  if (!existsSync(absoluteDir)) {
    return [];
  }
  return readdirSync(absoluteDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => `${relativePrefix}/${name}`);
}

function verifyChecksumManifest(manifestRelative: string): string[] {
  const absolute = resolve(repoRoot, manifestRelative);
  const root = resolve(absolute, "..");
  const lines = readFileSync(absolute, "utf8").trim().split(/\r?\n/);
  const paths: string[] = [];
  for (const line of lines) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    assert.ok(match, `bad checksum line in ${manifestRelative}: ${line}`);
    const [, digest, relative] = match;
    const actual = createHash("sha256")
      .update(readFileSync(resolve(root, relative!)))
      .digest("hex");
    assert.equal(actual, digest, `${manifestRelative}: ${relative}`);
    const prefix = manifestRelative.replace(/\/SHA256SUMS$/, "");
    paths.push(`${prefix}/${relative!.replace(/\\/g, "/")}`);
  }
  return paths;
}

function greenFixtures(): string[] {
  return [
    `${GREEN_FIXTURE_ROOT}/caleb.json`,
    ...listJsonFiles(
      resolve(repoRoot, GREEN_FIXTURE_ROOT, "synthetic"),
      `${GREEN_FIXTURE_ROOT}/synthetic`,
    ),
  ];
}

function foundryImportFixtures(): string[] {
  return [
    `${FOUNDRY_FIXTURE_ROOT}/fvtt-Actor-blank-GZGftVGSKSRNSREr.json`,
    `${FOUNDRY_FIXTURE_ROOT}/live-populated/fvtt-Actor-arendt,-george-1JRxGMZ9oXtUmaSg.json`,
    `${FOUNDRY_FIXTURE_ROOT}/live-populated/fvtt-Actor-standard-8MeAVbzLk6HWm1DS.json`,
    ...listJsonFiles(
      resolve(repoRoot, FOUNDRY_FIXTURE_ROOT, "synthetic"),
      `${FOUNDRY_FIXTURE_ROOT}/synthetic`,
    ),
    ...listJsonFiles(
      resolve(repoRoot, FOUNDRY_FIXTURE_ROOT, "live-apply"),
      `${FOUNDRY_FIXTURE_ROOT}/live-apply`,
    ),
  ];
}

function foundryExportFixtures(): string[] {
  return [
    ...listJsonFiles(
      resolve(repoRoot, CANONICAL_EXPORT_FIXTURE_ROOT),
      CANONICAL_EXPORT_FIXTURE_ROOT,
    ),
    ...listJsonFiles(
      resolve(repoRoot, FOUNDRY_FIXTURE_ROOT, "live-apply"),
      `${FOUNDRY_FIXTURE_ROOT}/live-apply`,
    ),
  ];
}

function buildBundles(): CapabilityEvidenceBundle[] {
  const green = greenFixtures();
  const importFixtures = foundryImportFixtures();
  const exportFixtures = foundryExportFixtures();

  const greenCapability = createGreenAgentCreatorCapability({
    fixtures: green,
    tests: GREEN_TESTS,
  });
  const importCapability = createFoundryDeltaGreenImportCapability({
    fixtures: importFixtures,
    tests: FOUNDRY_TESTS,
  });
  const exportCapability = createFoundryDeltaGreenExportCapability({
    fixtures: exportFixtures,
    tests: FOUNDRY_TESTS,
  });

  return [
    {
      capability: greenCapability,
      inventory: parseMappingInventory(readJson(GREEN_INVENTORY_PATH)),
      knownLoss: parseKnownLossManifest(readJson(GREEN_KNOWN_LOSS_PATH)),
      fixtureManifest: green.map((path) => ({ path, checksum: checksum(path) })),
      presentArtifactPaths: new Set([
        GREEN_INVENTORY_PATH,
        GREEN_KNOWN_LOSS_PATH,
        ...green,
        ...GREEN_TESTS,
      ]),
    },
    {
      capability: importCapability,
      inventory: parseMappingInventory(readJson(FOUNDRY_IMPORT_INVENTORY_PATH)),
      knownLoss: parseKnownLossManifest(readJson(FOUNDRY_IMPORT_KNOWN_LOSS_PATH)),
      fixtureManifest: importFixtures.map((path) => ({ path, checksum: checksum(path) })),
      presentArtifactPaths: new Set([
        FOUNDRY_IMPORT_INVENTORY_PATH,
        FOUNDRY_IMPORT_KNOWN_LOSS_PATH,
        ...importFixtures,
        ...FOUNDRY_TESTS,
      ]),
    },
    {
      capability: exportCapability,
      inventory: parseMappingInventory(readJson(FOUNDRY_EXPORT_INVENTORY_PATH)),
      knownLoss: parseKnownLossManifest(readJson(FOUNDRY_EXPORT_KNOWN_LOSS_PATH)),
      fixtureManifest: exportFixtures.map((path) => ({ path, checksum: checksum(path) })),
      presentArtifactPaths: new Set([
        FOUNDRY_EXPORT_INVENTORY_PATH,
        FOUNDRY_EXPORT_KNOWN_LOSS_PATH,
        ...exportFixtures,
        ...FOUNDRY_TESTS,
      ]),
    },
  ];
}

describe("verified capability registry agreement (#29)", () => {
  it("loads the committed registry for exactly the three initial capabilities", () => {
    const registry = parseVerifiedCapabilityRegistry(readJson(REGISTRY_PATH));
    assert.deepEqual(
      registry.capabilities.map((entry) => entry.id),
      [...VERIFIED_INITIAL_CAPABILITY_IDS],
    );
  });

  it("agrees registry, inventories, known-loss, checksums, fixtures, and tests", () => {
    const registry = parseVerifiedCapabilityRegistry(readJson(REGISTRY_PATH));
    for (const entry of registry.capabilities) {
      for (const manifest of entry.checksumManifests) {
        const listed = verifyChecksumManifest(manifest);
        assert.ok(listed.length > 0, manifest);
      }
    }

    const bundles = buildBundles();
    const result = validateVerifiedCapabilityRegistry({ registry, bundles });
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues, null, 2));
  });

  it("does not advertise adjacent Foundry or Delta Green versions", () => {
    const registry = parseVerifiedCapabilityRegistry(readJson(REGISTRY_PATH));
    const serialized = JSON.stringify(registry);
    assert.equal(serialized.includes("14.364"), false);
    assert.equal(serialized.includes("1.6.0"), false);
    assert.equal(serialized.includes("1.8.0"), false);
  });
});
