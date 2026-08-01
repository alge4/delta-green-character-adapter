import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCanonicalId,
  generateAgentJsonSchema,
  parseAgentSnapshot,
  serializeAgentSnapshot,
} from "../src/index.js";

export const emptySnapshot = {
  schemaVersion: "1.0.0",
  agentId: "0f52c9e8-4e11-4cbc-a89b-e2e504481832",
  identity: {},
  biography: {},
  statistics: {},
  resources: {},
  skills: { standard: {}, custom: [], specialTraining: [] },
  relationships: { bonds: [] },
  psychology: { motivations: [], disorders: [], adaptations: [] },
  inventory: { weapons: [], armor: [], gear: [], rituals: [], tomes: [] },
  notes: { player: [], handler: [] },
  campaignState: {},
  provenance: {
    adapter: { id: "test", version: "1.0.0" },
    source: { format: "test-fixture" },
    contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  extensions: {},
} as const;

describe("canonical Agent Snapshot public API", () => {
  it("parses a structurally readable Draft Agent", () => {
    assert.deepEqual(parseAgentSnapshot(emptySnapshot), emptySnapshot);
  });

  it("rejects unknown canonical fields instead of discarding them", () => {
    assert.throws(() =>
      parseAgentSnapshot({ ...emptySnapshot, foundryActorId: "abc123" }),
    );
  });

  it("rejects impossible ISO calendar dates", () => {
    assert.throws(() =>
      parseAgentSnapshot({
        ...emptySnapshot,
        biography: { dateOfBirth: "2026-99-99" },
      }),
    );
  });

  it("requires extension data to sit inside an adapter namespace", () => {
    assert.throws(() =>
      parseAgentSnapshot({ ...emptySnapshot, extensions: { raw: "source value" } }),
    );
    assert.deepEqual(
      parseAgentSnapshot({
        ...emptySnapshot,
        extensions: { greenAgentCreator: { raw: "source value" } },
      }).extensions,
      { greenAgentCreator: { raw: "source value" } },
    );
  });

  it("serializes object keys deterministically without changing array order", () => {
    const first = serializeAgentSnapshot(
      parseAgentSnapshot({
        ...emptySnapshot,
        extensions: { exampleAdapter: { zebra: { second: 2, first: 1 }, alpha: true } },
      }),
    );
    const second = serializeAgentSnapshot(
      parseAgentSnapshot({
        ...emptySnapshot,
        extensions: { exampleAdapter: { alpha: true, zebra: { first: 1, second: 2 } } },
      }),
    );

    assert.equal(first, second);
    assert.equal(first.endsWith("\n"), true);
  });

  it("publishes a strict portable JSON Schema", () => {
    const schema = generateAgentJsonSchema();
    assert.equal(schema["$schema"], "https://json-schema.org/draft/2020-12/schema");
    assert.equal(
      schema["$id"],
      "https://delta-green-character-adapter.dev/schema/agent/1.0.0",
    );
    assert.equal(schema["additionalProperties"], false);
  });

  it("creates lowercase UUID v4 canonical identities", () => {
    assert.match(
      createCanonicalId(),
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
