import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAgentSnapshot, type AgentSnapshot } from "@delta-green-character-adapter/character-model";

import {
  canonicalSemanticView,
  exportFoundryDeltaGreen,
  foundrySemanticView,
  importFoundryDeltaGreen,
} from "../src/index.js";
import {
  asActor,
  asSnapshot,
  BLANK_ACTOR,
  canonicalFixtureNames,
  encodeJson,
  LIVE_GEORGE,
  LIVE_STANDARD,
  readCanonicalFixture,
  readFoundryFixture,
  readFoundryFixtureBytes,
  sequentialIdFactory,
} from "./helpers.js";

function importActor(actor: unknown): AgentSnapshot {
  const result = importFoundryDeltaGreen(encodeJson(actor), { createId: sequentialIdFactory() });
  assert.equal(result.blocked, false);
  return parseAgentSnapshot(asSnapshot(result));
}

function exportSnapshot(snapshot: AgentSnapshot) {
  const result = exportFoundryDeltaGreen(snapshot, { createId: sequentialIdFactory() });
  assert.equal(result.blocked, false);
  return asActor(result);
}

describe("Foundry → canonical → Foundry round trips (#25)", () => {
  const fixtures = [BLANK_ACTOR, LIVE_GEORGE, LIVE_STANDARD];

  it("preserves canonical meaning across a full cycle", () => {
    for (const name of fixtures) {
      const first = parseAgentSnapshot(
        asSnapshot(
          importFoundryDeltaGreen(readFoundryFixtureBytes(name), {
            createId: sequentialIdFactory(),
          }),
        ),
      );
      const second = importActor(exportSnapshot(first));
      assert.deepEqual(canonicalSemanticView(second), canonicalSemanticView(first), name);
    }
  });

  it("reaches a fixed point in Foundry source data after one cycle", () => {
    for (const name of fixtures) {
      const first = parseAgentSnapshot(
        asSnapshot(
          importFoundryDeltaGreen(readFoundryFixtureBytes(name), {
            createId: sequentialIdFactory(),
          }),
        ),
      );
      const exported = exportSnapshot(first);
      const reexported = exportSnapshot(importActor(exported));
      assert.deepEqual(foundrySemanticView(reexported), foundrySemanticView(exported), name);
    }
  });

  it("rebuilds the pinned blank Actor without semantic drift", () => {
    const original = readFoundryFixture(BLANK_ACTOR);
    const rebuilt = exportSnapshot(importActor(original));
    assert.deepEqual(foundrySemanticView(rebuilt), foundrySemanticView(original));
  });
});

// SAN ≥ 100 is the one canonical value Delta Green 1.7.0 cannot persist at all, because the
// system reads it as the initialization sentinel. That loss is asserted in export-fixture-matrix.
const LOSSY_CANONICAL_FIXTURES = new Set(["f3b-sanity-at-sentinel.json"]);

describe("canonical → Foundry → canonical round trips (#25)", () => {
  it("preserves the meaning Delta Green 1.7.0 can persist", () => {
    for (const name of canonicalFixtureNames()) {
      if (LOSSY_CANONICAL_FIXTURES.has(name)) {
        continue;
      }
      const original = parseAgentSnapshot(readCanonicalFixture(name));
      const restored = importActor(exportSnapshot(original));
      const options = {
        tolerateFoundryLosses: true,
        restrictStandardSkillsTo: Object.keys(original.skills.standard),
      } as const;
      assert.deepEqual(
        canonicalSemanticView(restored, options),
        canonicalSemanticView(original, options),
        name,
      );
    }
  });

  it("reaches a canonical fixed point after one cycle for every fixture", () => {
    for (const name of canonicalFixtureNames()) {
      const original = parseAgentSnapshot(readCanonicalFixture(name));
      const first = importActor(exportSnapshot(original));
      const second = importActor(exportSnapshot(first));
      assert.deepEqual(canonicalSemanticView(second), canonicalSemanticView(first), name);
    }
  });
});
