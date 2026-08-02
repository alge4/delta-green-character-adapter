import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogueDiagnosticCodes } from "@delta-green-character-adapter/adapter-core";
import { parseAgentSnapshot } from "@delta-green-character-adapter/character-model";

import { importFoundryDeltaGreen } from "../src/index.js";
import {
  asSnapshot,
  BLANK_ACTOR,
  foundryPartition,
  hasDiagnostic,
  knownLossFired,
  readFoundryFixtureBytes,
  sequentialIdFactory,
  sha256Foundry,
} from "./helpers.js";

describe("importFoundryDeltaGreen F1 blank Actor golden (#25)", () => {
  const bytes = readFoundryFixtureBytes(BLANK_ACTOR);

  it("normalizes the SAN and breaking point initialization sentinels", () => {
    const result = importFoundryDeltaGreen(bytes, { createId: sequentialIdFactory() });
    assert.equal(result.blocked, false);
    const snapshot = parseAgentSnapshot(asSnapshot(result));

    assert.deepEqual(snapshot.resources.sanity, { current: 50, maximum: 50 });
    assert.deepEqual(snapshot.resources.breakingPoint, { current: 40, baseline: 40 });
    assert.ok(knownLossFired(result, "san-sentinel-collides-with-explicit-high-san"));
    assert.ok(knownLossFired(result, "breaking-point-baseline-derived"));
  });

  it("maps default statistics, resources, and the full standard skill table", () => {
    const snapshot = parseAgentSnapshot(
      asSnapshot(importFoundryDeltaGreen(bytes, { createId: sequentialIdFactory() })),
    );

    assert.equal(snapshot.identity.name, "blank");
    assert.equal(snapshot.statistics.strength?.score, 10);
    assert.equal(snapshot.statistics.charisma?.score, 10);
    assert.equal(snapshot.statistics.strength?.distinguishingFeature, undefined);
    assert.deepEqual(snapshot.resources.hitPoints, { current: 10, maximum: 10 });
    assert.deepEqual(snapshot.resources.willpower, { current: 10, maximum: 10 });
    assert.equal(snapshot.resources.wounds, undefined);
    assert.equal(snapshot.resources.exhausted, false);
    assert.equal(snapshot.resources.firstAidAttempted, false);
    assert.equal(Object.keys(snapshot.skills.standard).length, 36);
    assert.equal(snapshot.skills.standard.heavyMachinery?.proficiency, 10);
    assert.equal(snapshot.skills.standard.unnatural?.failureMarked, false);
    assert.equal(snapshot.campaignState.impossibleLandscapes, undefined);
    assert.equal(snapshot.notes.player.length, 0);
    assert.equal(snapshot.notes.handler.length, 0);
    assert.equal(snapshot.biography.age, undefined);
  });

  it("demotes Unarmed Combat to a custom skill and keeps the system Unarmed Attack weapon", () => {
    const result = importFoundryDeltaGreen(bytes, { createId: sequentialIdFactory() });
    const snapshot = parseAgentSnapshot(asSnapshot(result));

    const unarmedSkill = snapshot.skills.custom.find((skill) => skill.group === "unarmed_combat");
    assert.equal(unarmedSkill?.proficiency, 40);
    assert.equal(unarmedSkill?.label, "Unarmed Combat");
    assert.ok(knownLossFired(result, "unarmed-combat-not-standard"));

    assert.equal(snapshot.inventory.weapons.length, 1);
    const weapon = snapshot.inventory.weapons[0];
    assert.equal(weapon?.name, "Unarmed Attack");
    assert.equal(weapon?.skill, "unarmed_combat");
    assert.equal(weapon?.damage, "1D4-1");
    assert.equal(weapon?.equipped, true);

    const identity = foundryPartition(snapshot, "identity");
    const systemOwned = identity.systemOwnedItems as Record<string, unknown>;
    assert.deepEqual(Object.values(systemOwned), [
      { AutoAdded: true, SystemName: "unarmed-attack" },
    ]);
    const itemIds = identity.items as Record<string, unknown>;
    assert.deepEqual(Object.values(itemIds), ["AfSWj5tWv6LQvIWb"]);
  });

  it("retains sheet knobs in extensions and drops nothing else silently", () => {
    const snapshot = parseAgentSnapshot(
      asSnapshot(importFoundryDeltaGreen(bytes, { createId: sequentialIdFactory() })),
    );

    const sheet = foundryPartition(snapshot, "sheet");
    assert.equal(sheet.schemaVersion, 1);
    assert.equal(sheet.exhaustedPenalty, -20);
    assert.equal(sheet.healthMin, 0);
    assert.equal(sheet.wpMin, 0);
    assert.deepEqual(sheet.settings, {
      sorting: {
        weaponSortAlphabetical: false,
        armorSortAlphabetical: false,
        gearSortAlphabetical: false,
        tomeSortAlphabetical: false,
        ritualSortAlphabetical: false,
      },
      rolling: { defaultPercentileModifier: 20 },
    });

    // Only the two Foundry-only weapon fields lack canonical homes on a blank Actor.
    assert.deepEqual(Object.keys(foundryPartition(snapshot, "raw")).sort(), [
      "items[0].system.customSkillTarget",
      "items[0].system.isLethal",
    ]);
  });

  it("records exact-target provenance without an unverified version warning", () => {
    const result = importFoundryDeltaGreen(bytes, { createId: sequentialIdFactory() });
    const snapshot = parseAgentSnapshot(asSnapshot(result));

    assert.equal(snapshot.provenance.source.format, "foundry-deltagreen");
    assert.equal(snapshot.provenance.source.version, "14.365+1.7.0");
    assert.equal(snapshot.provenance.source.recordId, undefined);
    assert.equal(snapshot.provenance.adapter.id, "foundry-deltagreen-import");
    assert.equal(snapshot.provenance.contentHash, sha256Foundry(BLANK_ACTOR));
    assert.equal(
      hasDiagnostic(result, (code) => code === catalogueDiagnosticCodes.unverifiedVersion),
      false,
    );
  });

  it("produces identical snapshots for identical bytes when ids are injected", () => {
    const first = asSnapshot(importFoundryDeltaGreen(bytes, { createId: sequentialIdFactory() }));
    const second = asSnapshot(importFoundryDeltaGreen(bytes, { createId: sequentialIdFactory() }));
    assert.deepEqual(first, second);
  });
});
