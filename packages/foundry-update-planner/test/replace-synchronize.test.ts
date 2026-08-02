import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";

import { planFoundryActorUpdate } from "../src/plan.js";
import { cloneJson, isRecord } from "../src/util.js";
import {
  BLANK_ACTOR,
  asPlan,
  bindActor,
  entriesOf,
  readCanonicalFixture,
  readFoundryFixture,
  selectedEntries,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

function populatedWeaponsTarget(agentId: string): unknown {
  const blank = readFoundryFixture(BLANK_ACTOR);
  const target = bindActor(withActorName(blank, "Export Subject"), agentId) as Record<string, unknown>;
  const items = Array.isArray(target.items) ? [...target.items] : [];
  items.push({
    _id: "ExtraWeapon00001",
    name: "Service Pistol",
    type: "weapon",
    system: {
      description: "A sidearm",
      skill: "firearms",
      skillModifier: 0,
      customSkillTarget: 50,
      range: "15m",
      damage: "1d10",
      armorPiercing: 0,
      lethality: 0,
      isLethal: false,
      killRadius: "",
      ammo: "15",
      expense: "Standard",
      equipped: true,
    },
    flags: {
      [ADAPTER_FLAG_NAMESPACE]: { canonicalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    },
  });
  items.push({
    _id: "UnboundWeapon001",
    name: "Mystery Knife",
    type: "weapon",
    system: {
      description: "Unknown provenance",
      skill: "melee_weapons",
      skillModifier: 0,
      customSkillTarget: 50,
      range: "",
      damage: "1d6",
      armorPiercing: 0,
      lethality: 0,
      isLethal: false,
      killRadius: "",
      ammo: "",
      expense: "Standard",
      equipped: false,
    },
    flags: {},
  });
  target.items = items;
  // Break blank fingerprint.
  const system = isRecord(target.system) ? { ...target.system } : {};
  system.biography = { ...(isRecord(system.biography) ? system.biography : {}), profession: "Agent" };
  target.system = system;
  return target;
}

describe("Replace and Synchronize (#10, F5d–F5f)", () => {
  const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
  const agentId = (snapshot as { agentId: string }).agentId;

  it("Replace proposes removal of bound weapons in a complete scope (F5d)", () => {
    const target = populatedWeaponsTarget(agentId);
    const result = planFoundryActorUpdate(snapshot, target, {
      createId: sequentialIdFactory(),
      mode: "replace",
    });
    const plan = asPlan(result);
    const removals = entriesOf(plan, (entry) => entry.operation === "remove");
    assert.ok(removals.length >= 1);
    const boundRemoval = removals.find((entry) => entry.path.includes("ExtraWeapon00001"));
    assert.ok(boundRemoval);
    assert.equal(boundRemoval.selectedByDefault, true);
    assert.equal(boundRemoval.scope, "weapons");
  });

  it("protects Unarmed Attack from default deletion (F5e)", () => {
    const target = populatedWeaponsTarget(agentId) as Record<string, unknown>;
    // Duplicate system Unarmed so one remains unmatched after export binds the first.
    const items = Array.isArray(target.items) ? [...target.items] : [];
    items.push({
      _id: "UnarmedDup0000001",
      name: "Unarmed Attack",
      type: "weapon",
      system: {
        description: "",
        skill: "custom",
        skillModifier: 0,
        customSkillTarget: 50,
        range: "",
        damage: "1d4-1",
        armorPiercing: 0,
        lethality: 0,
        isLethal: false,
        killRadius: "",
        ammo: "",
        expense: "Standard",
        equipped: true,
      },
      flags: {
        deltagreen: { AutoAdded: true, SystemName: "unarmed-attack" },
      },
    });
    target.items = items;

    const result = planFoundryActorUpdate(snapshot, target, {
      createId: sequentialIdFactory(),
      mode: "replace",
    });
    const plan = asPlan(result);
    const unarmed = entriesOf(
      plan,
      (entry) => entry.operation === "remove" && entry.fieldClass === "systemManaged",
    );
    assert.ok(unarmed.length >= 1);
    assert.ok(unarmed.every((entry) => entry.selectedByDefault === false));
    assert.ok(
      result.diagnostics.some((entry) => entry.code === "adapter.state.protected-removal"),
    );
    assert.equal(
      selectedEntries(plan, "remove").some((entry) => entry.fieldClass === "systemManaged"),
      false,
    );
  });

  it("deselects unbound pre-existing removals until individually confirmed", () => {
    const target = populatedWeaponsTarget(agentId);
    const result = planFoundryActorUpdate(snapshot, target, {
      createId: sequentialIdFactory(),
      mode: "replace",
    });
    const plan = asPlan(result);
    const unbound = entriesOf(
      plan,
      (entry) => entry.operation === "remove" && entry.path.includes("UnboundWeapon001"),
    );
    assert.equal(unbound.length, 1);
    assert.equal(unbound[0]!.selectedByDefault, false);
  });

  it("deselects Synchronize mutable changes when provenance is stale (F5f)", () => {
    const blank = readFoundryFixture(BLANK_ACTOR);
    const target = bindActor(withActorName(blank, "Export Subject"), agentId, {
      audit: {
        capabilityId: "canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0",
        adapterId: "foundry-deltagreen-export",
        adapterVersion: "0.0.0",
        sourceFormat: "canonical-fixture",
        sourceContentHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        timestamp: "2026-08-02T12:00:00.000Z",
      },
    });
    const staleSnapshot = cloneJson(snapshot) as Record<string, unknown>;
    const provenance = isRecord(staleSnapshot.provenance) ? { ...staleSnapshot.provenance } : {};
    provenance.capturedAt = "2026-08-01T12:00:00.000Z";
    staleSnapshot.provenance = provenance;

    const result = planFoundryActorUpdate(staleSnapshot, target, {
      createId: sequentialIdFactory(),
      mode: "synchronize",
      now: "2026-08-02T13:00:00.000Z",
    });
    const plan = asPlan(result);
    assert.ok(result.diagnostics.some((entry) => entry.code === "adapter.state.stale"));
    const mutableSelected = selectedEntries(plan).filter((entry) => entry.fieldClass === "mutable");
    assert.equal(mutableSelected.length, 0);
  });

  it("records GM permission requirements for Handler-only content", () => {
    const full = readCanonicalFixture("f2-full-semantic-agent.json");
    const blank = readFoundryFixture(BLANK_ACTOR);
    const target = bindActor(
      withActorName(blank, (full as { identity: { name: string } }).identity.name),
      (full as { agentId: string }).agentId,
    );
    const result = planFoundryActorUpdate(full, target, {
      createId: sequentialIdFactory(),
      mode: "replace",
      callerIsGm: false,
    });
    const plan = asPlan(result);
    assert.equal(plan.permissions.requiresActorUpdate, true);
    if (plan.permissions.requiresGmForHandlerContent) {
      const handler = plan.entries.filter((entry) => entry.fieldClass === "handlerOnly");
      assert.ok(handler.every((entry) => entry.selectedByDefault === false));
    }
  });
});
