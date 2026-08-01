import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessAgentSnapshot,
  createCanonicalId,
  generateAgentJsonSchema,
  parseAgentSnapshot,
  serializeAgentSnapshot,
  standardSkillIdSchema,
} from "../src/index.js";

const emptySnapshot = {
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

  it("derives red completeness for a mathematically incomplete snapshot", () => {
    assert.equal(
      assessAgentSnapshot(parseAgentSnapshot(emptySnapshot)).completeness,
      "red",
    );
  });

  it("serializes object keys deterministically without changing array order", () => {
    const snapshot = parseAgentSnapshot({
      ...emptySnapshot,
      extensions: { zebra: { second: 2, first: 1 }, alpha: true },
    });

    const first = serializeAgentSnapshot(snapshot);
    const second = serializeAgentSnapshot(
      parseAgentSnapshot({
        ...emptySnapshot,
        extensions: { alpha: true, zebra: { first: 1, second: 2 } },
      }),
    );

    assert.equal(first, second);
    assert.equal(first.endsWith("\n"), true);
  });

  it("derives green completeness from a mathematically complete Agent", () => {
    const statistic = { score: 10 };
    const complete = parseAgentSnapshot({
      ...emptySnapshot,
      identity: { name: "Casey" },
      biography: { profession: "Federal Agent" },
      statistics: {
        strength: statistic,
        constitution: statistic,
        dexterity: statistic,
        intelligence: statistic,
        power: statistic,
        charisma: statistic,
      },
      resources: {
        hitPoints: { current: 10, maximum: 10 },
        willpower: { current: 10, maximum: 10 },
        sanity: { current: 50, maximum: 99 },
        breakingPoint: { current: 40, baseline: 40 },
      },
      skills: {
        standard: Object.fromEntries(
          standardSkillIdSchema.options.map((id) => [
            id,
            { proficiency: 20, failureMarked: false },
          ]),
        ),
        custom: [],
        specialTraining: [],
      },
    });

    assert.deepEqual(assessAgentSnapshot(complete), {
      completeness: "green",
      diagnostics: [],
    });
  });

  it("reports missing Standard Skills as mathematically incomplete", () => {
    const assessment = assessAgentSnapshot(
      parseAgentSnapshot({
        ...emptySnapshot,
        identity: { name: "Casey" },
        biography: { profession: "Federal Agent" },
        statistics: Object.fromEntries(
          ["strength", "constitution", "dexterity", "intelligence", "power", "charisma"].map(
            (name) => [name, { score: 10 }],
          ),
        ),
        resources: {
          hitPoints: { current: 10, maximum: 10 },
          willpower: { current: 10, maximum: 10 },
          sanity: { current: 50, maximum: 99 },
          breakingPoint: { current: 40, baseline: 40 },
        },
      }),
    );

    assert.equal(assessment.completeness, "red");
    assert.ok(
      assessment.diagnostics.some(
        ({ code, path }) =>
          code === "agent.skills.standard.missing" && path === "skills.standard.accounting",
      ),
    );
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

  it("reports duplicate identities and dangling canonical references", () => {
    const reusedId = "0e0b3bdb-a34a-4cfa-bc45-957b7ce661fd";
    const assessment = assessAgentSnapshot(
      parseAgentSnapshot({
        ...emptySnapshot,
        psychology: {
          adaptations: [],
          disorders: [{ id: reusedId, name: "Insomnia", cured: false }],
          motivations: [
            {
              id: reusedId,
              statement: "Understand the signal",
              crossedOut: false,
              linkedDisorderId: "9f23101e-9078-4fd7-b935-500963a3f24b",
            },
          ],
        },
      }),
    );

    assert.ok(assessment.diagnostics.some(({ code }) => code === "agent.identity.duplicate"));
    assert.ok(
      assessment.diagnostics.some(
        ({ code }) => code === "agent.psychology.motivation.disorder-reference-missing",
      ),
    );
  });

  it("preserves unusual explicit resources and reports them without clamping", () => {
    const snapshot = parseAgentSnapshot({
      ...emptySnapshot,
      resources: { hitPoints: { current: 12, maximum: 10 } },
    });
    const assessment = assessAgentSnapshot(snapshot);

    assert.equal(snapshot.resources.hitPoints?.current, 12);
    assert.ok(
      assessment.diagnostics.some(
        ({ code, completenessImpact }) =>
          code === "agent.resource.current-above-maximum" && completenessImpact === "none",
      ),
    );
  });
});
