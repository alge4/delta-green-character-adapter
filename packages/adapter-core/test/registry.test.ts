import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseCapabilityRecord,
  parseKnownLossManifest,
  parseMappingInventory,
  parseVerifiedCapabilityRegistry,
  validateCapabilityEvidence,
  validateVerifiedCapabilityRegistry,
  type CapabilityEvidenceBundle,
  type CapabilityRecord,
} from "../src/index.js";

const GREEN_ID = "green-agent-creator-5c9e92d-to-canonical-1.0.0";
const FOUNDRY_IMPORT_ID = "foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0";
const FOUNDRY_EXPORT_ID = "canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0";

function sampleCapability(id: string, inventory: string, knownLoss: string): CapabilityRecord {
  const direction = id.startsWith("canonical-") ? "export" : "import";
  return parseCapabilityRecord({
    id,
    adapterId: `${id}-adapter`,
    adapterVersion: "0.0.0",
    direction,
    source:
      direction === "import"
        ? { format: "sample", version: "1.0.0" }
        : { schema: "canonical-agent", version: "1.0.0" },
    canonical: { schema: "canonical-agent", version: "1.0.0" },
    ...(direction === "export"
      ? { target: { format: "sample", version: "1.0.0" } }
      : {}),
    fidelityClass: "lossy-semantic",
    knownExclusions: ["example"],
    evidence: {
      inventory,
      knownLoss,
      fixtures: ["fixtures/sample.json"],
      tests: ["packages/sample/test/sample.test.ts"],
    },
  });
}

function sampleBundle(capability: CapabilityRecord): CapabilityEvidenceBundle {
  const inventory = parseMappingInventory({
    capability: {
      id: capability.id,
      direction: capability.direction,
      adapterId: capability.adapterId,
      source: capability.source,
      target: capability.target ?? capability.canonical,
      fidelityClass: capability.fidelityClass,
      knownLoss: capability.evidence.knownLoss,
    },
    paths: [{ source: "/a", canonical: "/a", classification: "mapped" }],
  });
  const knownLoss = parseKnownLossManifest({
    capability: capability.id,
    fidelityClass: capability.fidelityClass,
    summary: "sample",
    losses: [
      {
        id: "sample-loss",
        category: "sample",
        source: "/a",
        canonical: null,
        loss: "dropped",
        diagnostic: "warning",
        remediation: "acknowledge",
      },
    ],
  });
  return {
    capability,
    inventory,
    knownLoss,
    fixtureManifest: [{ path: "fixtures/sample.json", checksum: `sha256:${"a".repeat(64)}` }],
    presentArtifactPaths: new Set([
      capability.evidence.inventory,
      capability.evidence.knownLoss!,
      "fixtures/sample.json",
      "packages/sample/test/sample.test.ts",
    ]),
  };
}

describe("verified capability registry (#29)", () => {
  it("parses a registry of exactly the three initial directed capabilities", () => {
    const registry = parseVerifiedCapabilityRegistry({
      schemaVersion: "1.0.0",
      capabilities: [
        {
          id: GREEN_ID,
          inventory: "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/inventory.json",
          knownLoss: "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/known-loss.json",
          checksumManifests: ["fixtures/green-agent-creator/5c9e92d/SHA256SUMS"],
        },
        {
          id: FOUNDRY_IMPORT_ID,
          inventory:
            "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/inventory.json",
          knownLoss:
            "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/known-loss.json",
          checksumManifests: ["fixtures/foundry/14.365-deltagreen-1.7.0/SHA256SUMS"],
        },
        {
          id: FOUNDRY_EXPORT_ID,
          inventory:
            "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/inventory.json",
          knownLoss:
            "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/known-loss.json",
          checksumManifests: [
            "fixtures/canonical/1.0.0/export-to-foundry/SHA256SUMS",
            "fixtures/foundry/14.365-deltagreen-1.7.0/SHA256SUMS",
          ],
        },
      ],
    });

    assert.equal(registry.capabilities.length, 3);
    assert.deepEqual(
      registry.capabilities.map((entry) => entry.id),
      [GREEN_ID, FOUNDRY_IMPORT_ID, FOUNDRY_EXPORT_ID],
    );
  });

  it("rejects registries that advertise adjacent or unverified capability ids", () => {
    assert.throws(
      () =>
        parseVerifiedCapabilityRegistry({
          schemaVersion: "1.0.0",
          capabilities: [
            {
              id: "foundry-13-deltagreen-1.6.0-to-canonical-1.0.0",
              inventory: "docs/mappings/fake/inventory.json",
              knownLoss: "docs/mappings/fake/known-loss.json",
              checksumManifests: ["fixtures/fake/SHA256SUMS"],
            },
          ],
        }),
      /verified initial capabilities|unsupported/i,
    );
  });

  it("requires every registry entry to have a matching evidence bundle that passes validateCapabilityEvidence", () => {
    const registry = parseVerifiedCapabilityRegistry({
      schemaVersion: "1.0.0",
      capabilities: [
        {
          id: GREEN_ID,
          inventory: "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/inventory.json",
          knownLoss: "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/known-loss.json",
          checksumManifests: ["fixtures/green-agent-creator/5c9e92d/SHA256SUMS"],
        },
        {
          id: FOUNDRY_IMPORT_ID,
          inventory:
            "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/inventory.json",
          knownLoss:
            "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/known-loss.json",
          checksumManifests: ["fixtures/foundry/14.365-deltagreen-1.7.0/SHA256SUMS"],
        },
        {
          id: FOUNDRY_EXPORT_ID,
          inventory:
            "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/inventory.json",
          knownLoss:
            "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/known-loss.json",
          checksumManifests: ["fixtures/canonical/1.0.0/export-to-foundry/SHA256SUMS"],
        },
      ],
    });

    const bundles = [
      sampleBundle(
        sampleCapability(
          GREEN_ID,
          "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/inventory.json",
          "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/known-loss.json",
        ),
      ),
      sampleBundle(
        sampleCapability(
          FOUNDRY_IMPORT_ID,
          "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/inventory.json",
          "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/known-loss.json",
        ),
      ),
      sampleBundle(
        sampleCapability(
          FOUNDRY_EXPORT_ID,
          "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/inventory.json",
          "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/known-loss.json",
        ),
      ),
    ];

    for (const bundle of bundles) {
      assert.equal(validateCapabilityEvidence(bundle).ok, true);
    }

    const result = validateVerifiedCapabilityRegistry({ registry, bundles });
    assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.issues, null, 2));
  });

  it("fails when a registry capability lacks an evidence bundle", () => {
    const registry = parseVerifiedCapabilityRegistry({
      schemaVersion: "1.0.0",
      capabilities: [
        {
          id: GREEN_ID,
          inventory: "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/inventory.json",
          knownLoss: "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/known-loss.json",
          checksumManifests: ["fixtures/green-agent-creator/5c9e92d/SHA256SUMS"],
        },
        {
          id: FOUNDRY_IMPORT_ID,
          inventory:
            "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/inventory.json",
          knownLoss:
            "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/known-loss.json",
          checksumManifests: ["fixtures/foundry/14.365-deltagreen-1.7.0/SHA256SUMS"],
        },
        {
          id: FOUNDRY_EXPORT_ID,
          inventory:
            "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/inventory.json",
          knownLoss:
            "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/known-loss.json",
          checksumManifests: ["fixtures/canonical/1.0.0/export-to-foundry/SHA256SUMS"],
        },
      ],
    });

    const result = validateVerifiedCapabilityRegistry({
      registry,
      bundles: [
        sampleBundle(
          sampleCapability(
            GREEN_ID,
            "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/inventory.json",
            "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/known-loss.json",
          ),
        ),
      ],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((issue) => issue.code === "registry.bundle.missing"));
    }
  });
});
