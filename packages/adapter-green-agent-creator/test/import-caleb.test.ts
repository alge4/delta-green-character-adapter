import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAgentSnapshot } from "@delta-green-character-adapter/character-model";

import { importGreenAgentCreator } from "../src/index.js";
import {
  asSnapshot,
  extensionPartition,
  hasDiagnostic,
  knownLossFired,
  readFixtureBytes,
  sequentialIdFactory,
  sha256File,
} from "./helpers.js";

describe("importGreenAgentCreator F1 Caleb golden (#17/#24)", () => {
  it("imports Caleb to a canonical Agent Snapshot with stable content hash and partitions", () => {
    const bytes = readFixtureBytes("caleb.json");
    const result = importGreenAgentCreator(bytes, { createId: sequentialIdFactory() });
    assert.equal(result.blocked, false);
    const snapshot = parseAgentSnapshot(asSnapshot(result));

    assert.equal(snapshot.identity.name, "Caleb");
    assert.equal(snapshot.biography.profession, "Computer Scientist or Engineer");
    assert.equal(snapshot.biography.age, 24);
    assert.equal(snapshot.biography.dateOfBirth, undefined);
    // GAC ships derivedCurrent all-zeros as uninitialized placeholders; import fills maxima.
    assert.equal(snapshot.resources.hitPoints?.current, 9);
    assert.equal(snapshot.resources.willpower?.current, 10);
    assert.equal(snapshot.resources.sanity?.current, 50);
    assert.equal(snapshot.resources.breakingPoint?.current, 40);
    assert.equal(snapshot.resources.hitPoints?.maximum, 9);
    assert.equal(snapshot.skills.standard.computerScience?.proficiency, 80);
    assert.equal(snapshot.skills.specialTraining.length, 0);
    assert.ok(snapshot.skills.custom.some((skill) => skill.group === "unarmed_combat"));
    assert.ok(snapshot.skills.custom.some((skill) => skill.group === "craft" && skill.label === "Electrician"));
    assert.equal(snapshot.relationships.bonds.length, 3);
    assert.equal(snapshot.psychology.motivations.length, 5);
    assert.equal(snapshot.notes.player.length, 0);
    assert.equal(snapshot.notes.handler.length, 0);
    assert.equal(snapshot.provenance.source.format, "green-agent-creator");
    assert.equal(snapshot.provenance.source.version, "5c9e92d");
    assert.equal(snapshot.provenance.adapter.id, "green-agent-creator-import");
    assert.equal(snapshot.provenance.contentHash, sha256File("caleb.json"));
    assert.equal(snapshot.provenance.source.recordId, undefined);

    const extension = snapshot.extensions.greenAgentCreator;
    assert.ok(extension);
    assert.ok("workflow" in extension);
    assert.ok("skillConstruction" in extension);
    assert.ok("sheetBaseline" in extension);
    assert.ok("identity" in extension);
    assert.ok("raw" in extension);
    assert.equal(extensionPartition(snapshot, "workflow").professionKey, "computer_scientist_engineer");
    assert.ok(knownLossFired(result, "unarmed-combat-not-standard"));
    assert.ok(knownLossFired(result, "non-iso-dob-omitted"));
    assert.ok(knownLossFired(result, "bond-damage-default-false"));
    assert.ok(knownLossFired(result, "motivation-crossed-out-default-false"));
    assert.ok(knownLossFired(result, "no-special-training"));
    assert.ok(knownLossFired(result, "creator-ids-not-canonical"));
    assert.ok(
      hasDiagnostic(result, (_code, message) => message.includes("differs from live personalInfo.age")),
    );
  });

  it("produces deterministic semantics for identical bytes when ids are injected", () => {
    const bytes = readFixtureBytes("caleb.json");
    const first = asSnapshot(importGreenAgentCreator(bytes, { createId: sequentialIdFactory() }));
    const second = asSnapshot(importGreenAgentCreator(bytes, { createId: sequentialIdFactory() }));
    assert.deepEqual(first, second);
  });
});
