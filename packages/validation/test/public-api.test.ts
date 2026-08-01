import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  STANDARD_SKILL_IDS,
  parseAgentSnapshot,
} from "@delta-green-character-adapter/character-model";

import { assessAgentSnapshot } from "../src/index.js";

const emptySnapshot = {
  schemaVersion: "1.0.0",
  agentId: "0f52c9e8-4e11-4cbc-a89b-e2e504481832",
  identity: {}, biography: {}, statistics: {}, resources: {},
  skills: { standard: {}, custom: [], specialTraining: [] },
  relationships: { bonds: [] },
  psychology: { motivations: [], disorders: [], adaptations: [] },
  inventory: { weapons: [], armor: [], gear: [], rituals: [], tomes: [] },
  notes: { player: [], handler: [] }, campaignState: {},
  provenance: {
    adapter: { id: "test", version: "1.0.0" }, source: { format: "test-fixture" },
    contentHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  extensions: {},
} as const;

describe("Agent Snapshot semantic assessment", () => {
  it("derives red completeness for a mathematically incomplete Draft Agent", () => {
    assert.equal(assessAgentSnapshot(parseAgentSnapshot(emptySnapshot)).completeness, "red");
  });

  it("derives green completeness from a mathematically complete Agent", () => {
    const statistic = { score: 10 };
    const complete = parseAgentSnapshot({
      ...emptySnapshot,
      identity: { name: "Casey" }, biography: { profession: "Federal Agent" },
      statistics: {
        strength: statistic, constitution: statistic, dexterity: statistic,
        intelligence: statistic, power: statistic, charisma: statistic,
      },
      resources: {
        hitPoints: { current: 10, maximum: 10 }, willpower: { current: 10, maximum: 10 },
        sanity: { current: 50, maximum: 99 }, breakingPoint: { current: 40, baseline: 40 },
      },
      skills: {
        standard: Object.fromEntries(STANDARD_SKILL_IDS.map((id) => [id, { proficiency: 20, failureMarked: false }])),
        custom: [], specialTraining: [],
      },
    });
    assert.deepEqual(assessAgentSnapshot(complete), { completeness: "green", diagnostics: [] });
  });

  it("preserves and warns about unusual proficiency values", () => {
    const snapshot = parseAgentSnapshot({
      ...emptySnapshot,
      skills: {
        standard: { accounting: { proficiency: 120, failureMarked: false } },
        custom: [], specialTraining: [],
      },
    });
    assert.equal(snapshot.skills.standard.accounting?.proficiency, 120);
    assert.ok(assessAgentSnapshot(snapshot).diagnostics.some(({ code }) => code === "agent.skills.proficiency.unusual"));
  });

  it("reports duplicate identities and dangling references", () => {
    const reusedId = "0e0b3bdb-a34a-4cfa-bc45-957b7ce661fd";
    const snapshot = parseAgentSnapshot({
      ...emptySnapshot,
      psychology: {
        adaptations: [], disorders: [{ id: reusedId, name: "Insomnia", cured: false }],
        motivations: [{ id: reusedId, statement: "Understand the signal", crossedOut: false, linkedDisorderId: "9f23101e-9078-4fd7-b935-500963a3f24b" }],
      },
    });
    const codes = assessAgentSnapshot(snapshot).diagnostics.map(({ code }) => code);
    assert.ok(codes.includes("agent.identity.duplicate"));
    assert.ok(codes.includes("agent.psychology.motivation.disorder-reference-missing"));
  });

  it("preserves unusual resources and reports them without affecting completeness", () => {
    const snapshot = parseAgentSnapshot({ ...emptySnapshot, resources: { hitPoints: { current: 12, maximum: 10 } } });
    assert.equal(snapshot.resources.hitPoints?.current, 12);
    assert.ok(assessAgentSnapshot(snapshot).diagnostics.some(({ code, completenessImpact }) => code === "agent.resource.current-above-maximum" && completenessImpact === "none"));
  });
});
