import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";

import { catalogueDiagnosticCodes } from "@delta-green-character-adapter/adapter-core";
import { parseAgentSnapshot } from "@delta-green-character-adapter/character-model";

import { importGreenAgentCreator } from "../src/index.js";
import {
  asSnapshot,
  extensionPartition,
  fixtureRoot,
  hasDiagnostic,
  knownLossFired,
  readFixtureBytes,
  sequentialIdFactory,
} from "./helpers.js";

function importFixture(relativePath: string) {
  return importGreenAgentCreator(readFixtureBytes(relativePath), { createId: sequentialIdFactory() });
}

describe("fixture matrix F2–F9 (#17 fixture-plan)", () => {
  it("vendors every planned synthetic fixture row", () => {
    const names = new Set(readdirSync(`${fixtureRoot}/synthetic`));
    for (const required of [
      "f2a-stat-roll.json",
      "f2b-stat-pointbuy.json",
      "f2c-stat-manual.json",
      "f2d-missing-derived.json",
      "f3a-custom-profession.json",
      "f3b-anthropologist.json",
      "f3c-computer-scientist.json",
      "f3d-federal-agent.json",
      "f3e-physician.json",
      "f3f-scientist.json",
      "f3g-special-operator.json",
      "f3h-or-and-typed-slots.json",
      "f3i-unknown-profession.json",
      "f3j-profession-disagreement.json",
      "f4a-extreme-violence.json",
      "f4b-captivity-coherent.json",
      "f4c-captivity-incoherent.json",
      "f4d-hard-experience.json",
      "f4e-things-man.json",
      "f4f-unknown-background.json",
      "f5a-edited-currents.json",
      "f5b-fail-marks-resolvable.json",
      "f5c-fail-marks-stale.json",
      "f5d-notes.json",
      "f5e-items-with-interior-empty.json",
      "f5f-high-skill-value.json",
      "f6a-typed-skills.json",
      "f6b-blank-typed-placeholders.json",
      "f6c-blank-typed-nonzero.json",
      "f6d-duplicate-typed.json",
      "f6e-unicode-typename.json",
      "f6f-unknown-skill-key.json",
      "f6g-unarmed-combat.json",
      "f7a-many-bonds.json",
      "f7b-empty-bond-description.json",
      "f7c-bond-score-over-cha.json",
      "f7d-other-adaptation.json",
      "f7e-empty-motivations-only.json",
      "f8a-legacy-omitted-optionals.json",
      "f8b-unknown-roots.json",
      "f8c-non-iso-dob.json",
      "f8d-non-digit-age.json",
      "f8e-non-object-root.json",
      "f8f-bad-stats.json",
      "f8g-missing-stat.json",
      "f8h-skills-not-array.json",
      "f9a-with-creator-id.json",
      "f9b-without-creator-id.json",
    ]) {
      assert.ok(names.has(required), `missing synthetic fixture ${required}`);
    }
  });

  it("F2: preserves explicit stats and derives missing maxima", () => {
    const roll = asSnapshot(importFixture("synthetic/f2a-stat-roll.json"));
    assert.equal(roll.statistics.strength?.score, 15);
    assert.equal(extensionPartition(roll, "workflow").statGenerationMethod, "roll");

    const missing = asSnapshot(importFixture("synthetic/f2d-missing-derived.json"));
    assert.equal(missing.resources.hitPoints?.maximum, 11);
    assert.equal(missing.resources.willpower?.maximum, 13);
    assert.equal(missing.resources.hitPoints?.current, 11);
  });

  it("F3: profession labels, custom names, unknown keys, and disagreements", () => {
    assert.equal(
      asSnapshot(importFixture("synthetic/f3a-custom-profession.json")).biography.profession,
      "Urban Explorer",
    );
    assert.equal(
      asSnapshot(importFixture("synthetic/f3d-federal-agent.json")).biography.profession,
      "Federal Agent",
    );
    const unknown = importFixture("synthetic/f3i-unknown-profession.json");
    assert.equal(asSnapshot(unknown).biography.profession, "deep_cover_librarian");
    assert.ok(hasDiagnostic(unknown, (code) => code === catalogueDiagnosticCodes.safeNormalization));

    const disagreement = importFixture("synthetic/f3j-profession-disagreement.json");
    assert.ok(hasDiagnostic(disagreement, (code) => code === catalogueDiagnosticCodes.derivedConflict));

    const slotted = asSnapshot(importFixture("synthetic/f3h-or-and-typed-slots.json"));
    const orChoices = extensionPartition(slotted, "workflow").orSkillChoices as Record<string, unknown>;
    assert.equal(orChoices.science_or_craft, "science");
    assert.ok(slotted.skills.custom.some((skill) => skill.group === "science" && skill.label === "Biology"));
    const scienceConstruction = extensionPartition(slotted, "skillConstruction")[
      "science_biology_fix"
    ] as Record<string, unknown>;
    assert.equal(scienceConstruction.slotId, "science_slot");
  });

  it("F4: traumatic backgrounds, adaptations, and basePOW diagnostics", () => {
    const violence = asSnapshot(importFixture("synthetic/f4a-extreme-violence.json"));
    assert.equal(violence.psychology.traumaticBackground, "extreme_violence");
    assert.equal(violence.psychology.adaptations[0]?.kind, "violence");

    const captivity = asSnapshot(importFixture("synthetic/f4b-captivity-coherent.json"));
    assert.equal(extensionPartition(captivity, "workflow").basePOW, 15);
    assert.equal(captivity.psychology.adaptations[0]?.kind, "helplessness");

    const incoherent = importFixture("synthetic/f4c-captivity-incoherent.json");
    assert.ok(hasDiagnostic(incoherent, (_c, message) => message.includes("basePOW")));

    const disorder = asSnapshot(importFixture("synthetic/f4e-things-man.json"));
    assert.equal(disorder.psychology.disorders[0]?.name, "Night terrors");
    assert.equal(disorder.psychology.disorders[0]?.cured, false);

    const unknown = importFixture("synthetic/f4f-unknown-background.json");
    assert.equal(asSnapshot(unknown).psychology.traumaticBackground, "eldritch_internship");

    const hard = asSnapshot(importFixture("synthetic/f4d-hard-experience.json"));
    assert.equal(hard.psychology.traumaticBackground, "hard_experience");
    const effects = extensionPartition(hard, "workflow").traumaticBackgroundEffects as Record<string, unknown>;
    assert.equal(effects._effectsApplied, true);
    assert.deepEqual(effects.hardExperienceSkills, ["alertness", "stealth"]);
  });

  it("F5: mutable campaign state, notes, items, and no silent clamping", () => {
    const currents = asSnapshot(importFixture("synthetic/f5a-edited-currents.json"));
    assert.equal(currents.resources.hitPoints?.current, 3);
    assert.equal(currents.resources.sanity?.current, 40);

    const marked = asSnapshot(importFixture("synthetic/f5b-fail-marks-resolvable.json"));
    assert.equal(marked.skills.standard.accounting?.failureMarked, true);

    const stale = importFixture("synthetic/f5c-fail-marks-stale.json");
    assert.deepEqual(extensionPartition(asSnapshot(stale), "raw").skillFailMarks, [
      "missing_instance_zzz",
    ]);

    const notes = asSnapshot(importFixture("synthetic/f5d-notes.json"));
    assert.equal(notes.notes.player[0]?.content, "Keep the USB drive hidden.");

    const items = asSnapshot(importFixture("synthetic/f5e-items-with-interior-empty.json"));
    assert.equal(items.inventory.gear.length, 3);
    assert.ok(knownLossFired(importFixture("synthetic/f5e-items-with-interior-empty.json"), "items-are-gear-only"));

    const high = importFixture("synthetic/f5f-high-skill-value.json");
    assert.equal(asSnapshot(high).skills.standard.firearms?.proficiency, 95);
  });

  it("F6: custom/family skills, blanks, duplicates, unknown keys, unarmed combat", () => {
    const typed = asSnapshot(importFixture("synthetic/f6a-typed-skills.json"));
    assert.ok(typed.skills.custom.some((skill) => skill.group === "art" && skill.label === "Painting"));
    assert.ok(typed.skills.custom.some((skill) => skill.group === "pilot" && skill.label === "Helicopter"));

    const blanks = asSnapshot(importFixture("synthetic/f6b-blank-typed-placeholders.json"));
    assert.equal(blanks.skills.custom.length, 0);

    const nonzero = asSnapshot(importFixture("synthetic/f6c-blank-typed-nonzero.json"));
    assert.equal(nonzero.skills.custom.length, 1);

    const duplicate = importFixture("synthetic/f6d-duplicate-typed.json");
    assert.ok(hasDiagnostic(duplicate, (code) => code === catalogueDiagnosticCodes.ambiguousIdentity));

    const unicode = asSnapshot(importFixture("synthetic/f6e-unicode-typename.json"));
    assert.equal(unicode.skills.custom[0]?.label, "Español");

    const unknown = importFixture("synthetic/f6f-unknown-skill-key.json");
    assert.equal(asSnapshot(unknown).skills.custom[0]?.group, "ritual_dancing");

    const unarmed = importFixture("synthetic/f6g-unarmed-combat.json");
    assert.ok(knownLossFired(unarmed, "unarmed-combat-not-standard"));
    assert.equal(asSnapshot(unarmed).skills.custom[0]?.label, "Unarmed Combat");
  });

  it("F7: bonds, motivations, and adaptation edge cases", () => {
    const many = importFixture("synthetic/f7a-many-bonds.json");
    assert.equal(asSnapshot(many).relationships.bonds.length, 8);

    const empty = asSnapshot(importFixture("synthetic/f7b-empty-bond-description.json"));
    assert.equal(empty.relationships.bonds[0]?.name, "Bond 1");

    const over = importFixture("synthetic/f7c-bond-score-over-cha.json");
    assert.ok(hasDiagnostic(over, (_c, message) => message.includes("exceeds CHA")));

    const other = asSnapshot(importFixture("synthetic/f7d-other-adaptation.json"));
    assert.equal(other.psychology.adaptations[0]?.kind, "other");
    assert.equal(other.psychology.adaptations[0]?.label, "Adapted to bureaucracy");
    assert.equal(other.psychology.adaptations[0]?.incidentMarks, undefined);

    const emptyMotivations = asSnapshot(importFixture("synthetic/f7e-empty-motivations-only.json"));
    assert.equal(emptyMotivations.psychology.motivations.length, 0);
  });

  it("F8: legacy/unknown/malformed and blocking boundaries", () => {
    const legacy = parseAgentSnapshot(asSnapshot(importFixture("synthetic/f8a-legacy-omitted-optionals.json")));
    assert.equal(legacy.resources.hitPoints?.maximum, 11);

    const unknown = asSnapshot(importFixture("synthetic/f8b-unknown-roots.json"));
    const raw = extensionPartition(unknown, "raw");
    assert.ok("mysteryRoot" in raw);
    assert.ok("personalInfo.favoriteColor" in raw);

    const dob = importFixture("synthetic/f8c-non-iso-dob.json");
    assert.equal(asSnapshot(dob).biography.dateOfBirth, undefined);
    assert.ok(knownLossFired(dob, "non-iso-dob-omitted"));

    const age = importFixture("synthetic/f8d-non-digit-age.json");
    assert.equal(asSnapshot(age).biography.age, undefined);

    for (const blocking of [
      "synthetic/f8e-non-object-root.json",
      "synthetic/f8f-bad-stats.json",
      "synthetic/f8g-missing-stat.json",
      "synthetic/f8h-skills-not-array.json",
    ]) {
      const result = importFixture(blocking);
      assert.equal(result.blocked, true, blocking);
      assert.equal(result.output, undefined, blocking);
    }
  });

  it("F9: provenance and identity partitions", () => {
    const withId = asSnapshot(importFixture("synthetic/f9a-with-creator-id.json"));
    assert.equal(withId.provenance.source.recordId, "gac-record-99");
    assert.equal(extensionPartition(withId, "identity").id, "gac-record-99");
    assert.notEqual(withId.agentId, "gac-record-99");

    const without = asSnapshot(importFixture("synthetic/f9b-without-creator-id.json"));
    assert.equal(without.provenance.source.recordId, undefined);
  });
});
