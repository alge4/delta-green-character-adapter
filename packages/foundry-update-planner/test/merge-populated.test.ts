import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";

import { planFoundryActorUpdate } from "../src/plan.js";
import { cloneJson, isRecord } from "../src/util.js";
import {
  BLANK_ACTOR,
  LIVE_STANDARD,
  asPlan,
  bindActor,
  entriesOf,
  readCanonicalFixture,
  readFoundryFixture,
  selectedEntries,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

describe("Merge into populated Actor (F5b/F5c)", () => {
  const snapshot = readCanonicalFixture("f2-full-semantic-agent.json");
  const agentId = (snapshot as { agentId: string }).agentId;

  it("preserves mutable currents by default on a populated target", () => {
    const live = readFoundryFixture(LIVE_STANDARD);
    const target = bindActor(live, agentId);
    const result = planFoundryActorUpdate(snapshot, target, {
      createId: sequentialIdFactory(),
      mode: "merge",
    });
    const plan = asPlan(result);
    assert.equal(plan.blankTarget, false);
    const hp = entriesOf(plan, (entry) => entry.path === "/system/health/value");
    assert.ok(hp.length >= 1);
    assert.ok(hp.every((entry) => entry.operation === "preserve" || entry.selectedByDefault === false));
    assert.ok(
      result.diagnostics.some((entry) => entry.code === "adapter.state.mutable-replacement") ||
        hp.some((entry) => entry.operation === "preserve"),
    );
  });

  it("selects profile skill proficiency updates by default", () => {
    const blank = readFoundryFixture(BLANK_ACTOR);
    const target = bindActor(withActorName(blank, (snapshot as { identity: { name: string } }).identity.name), agentId);
    // Perturb a skill so a profile update is visible even on blank-ish targets that are no longer blank.
    const mutated = cloneJson(target) as Record<string, unknown>;
    const system = isRecord(mutated.system) ? { ...mutated.system } : {};
    const skills = isRecord(system.skills) ? { ...system.skills } : {};
    skills.firearms = { proficiency: 5, label: "Firearms", failure: false };
    system.skills = skills;
    // Touch biography so blank fingerprint no longer matches.
    system.biography = { ...(isRecord(system.biography) ? system.biography : {}), profession: "Touched" };
    mutated.system = system;

    const result = planFoundryActorUpdate(snapshot, mutated, {
      createId: sequentialIdFactory(),
      mode: "merge",
    });
    const plan = asPlan(result);
    assert.equal(plan.blankTarget, false);
    const firearms = entriesOf(
      plan,
      (entry) => entry.path === "/system/skills/firearms/proficiency" && entry.operation === "update",
    );
    assert.ok(firearms.length === 1);
    assert.equal(firearms[0]!.selectedByDefault, true);
    assert.equal(firearms[0]!.fieldClass, "profile");
  });

  it("treats absent optional fields as no-ops and warns on explicit clears", () => {
    const blank = readFoundryFixture(BLANK_ACTOR);
    const target = bindActor(withActorName(blank, "Export Subject"), agentId);
    const minimal = readCanonicalFixture("f1-minimal-create-new.json") as Record<string, unknown>;
    const cleared = cloneJson(minimal);
    (cleared.biography as Record<string, unknown>).profession = "";

    const result = planFoundryActorUpdate(cleared, target, {
      createId: sequentialIdFactory(),
    });
    const plan = asPlan(result);
    const clearEntries = plan.entries.filter((entry) => entry.operation === "clear");
    for (const entry of clearEntries) {
      assert.equal(entry.selectedByDefault, false);
    }
    if (clearEntries.length > 0) {
      assert.ok(result.diagnostics.some((entry) => entry.code === "adapter.state.clear-warned"));
    }
    // Empty imported collections never clear existing collections in merge.
    assert.equal(selectedEntries(plan, "remove").length, 0);
    void ADAPTER_FLAG_NAMESPACE;
  });
});
