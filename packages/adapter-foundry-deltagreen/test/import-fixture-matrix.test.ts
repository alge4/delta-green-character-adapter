import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { catalogueDiagnosticCodes } from "@delta-green-character-adapter/adapter-core";
import { parseAgentSnapshot, type AgentSnapshot } from "@delta-green-character-adapter/character-model";

import { importFoundryDeltaGreen } from "../src/index.js";
import {
  asSnapshot,
  foundryPartition,
  hasDiagnostic,
  knownLossFired,
  LIVE_GEORGE,
  LIVE_STANDARD,
  readFoundryFixtureBytes,
  repoRoot,
  sequentialIdFactory,
  syntheticFixtureNames,
} from "./helpers.js";

const BLOCKING_SYNTHETICS = new Set([
  "f8a-root-not-object.json",
  "f8b-non-agent-type.json",
  "f8c-system-missing.json",
  "f8d-statistic-missing.json",
  "f8e-wrong-system-id.json",
]);

function importFixture(relativePath: string) {
  return importFoundryDeltaGreen(readFoundryFixtureBytes(relativePath), {
    createId: sequentialIdFactory(),
  });
}

function snapshotOf(relativePath: string): AgentSnapshot {
  return parseAgentSnapshot(asSnapshot(importFixture(relativePath)));
}

describe("F2 live populated Actors (#25)", () => {
  it("imports the George pregen export with its mutated resources and biography", () => {
    const result = importFixture(LIVE_GEORGE);
    const snapshot = parseAgentSnapshot(asSnapshot(result));

    assert.equal(snapshot.identity.name, "ARENDT, GEORGE");
    assert.equal(snapshot.statistics.strength?.score, 15);
    assert.equal(snapshot.statistics.strength?.distinguishingFeature, "Powerful");
    assert.deepEqual(snapshot.resources.hitPoints, { current: 14, maximum: 14 });
    assert.deepEqual(snapshot.resources.sanity, { current: 50, maximum: 50 });
    assert.deepEqual(snapshot.resources.breakingPoint, { current: 40, baseline: 40 });
    assert.equal(snapshot.skills.standard.computerScience?.proficiency, 80);
    assert.equal(snapshot.skills.standard.heavyMachinery?.proficiency, 30);
    assert.equal(snapshot.biography.profession, "Computer Scientist");
    assert.equal(snapshot.biography.nationality, "(U.S.A.) Karns, TN");
    assert.equal(snapshot.biography.age, undefined);
    assert.ok(knownLossFired(result, "non-digit-age-omitted"));
    assert.equal(foundryPartition(snapshot, "raw")["system.biography.age"], "29    (DEC 3)");
    assert.equal(snapshot.biography.physicalDescription?.content, "(Physical description of agent)");
    assert.equal(snapshot.relationships.bonds.length, 3);
    assert.equal(snapshot.inventory.weapons.length, 1);
    assert.equal(snapshot.skills.custom.filter((skill) => skill.group === "art").length, 1);
    assert.equal(
      snapshot.skills.custom.find((skill) => skill.group === "foreign_language")?.proficiency,
      40,
    );
  });

  it("imports the Standard live export with every Item type and typed skill family", () => {
    const result = importFixture(LIVE_STANDARD);
    const snapshot = parseAgentSnapshot(asSnapshot(result));

    assert.equal(snapshot.relationships.bonds.length, 1);
    assert.equal(snapshot.psychology.motivations.length, 1);
    assert.equal(snapshot.inventory.weapons.length, 1);
    assert.equal(snapshot.inventory.armor.length, 1);
    assert.equal(snapshot.inventory.gear.length, 1);
    assert.equal(snapshot.inventory.tomes.length, 1);
    assert.equal(snapshot.inventory.rituals.length, 1);
    assert.equal(snapshot.inventory.tomes[0]?.sanityLoss?.failure, "1D6");
    assert.equal(snapshot.inventory.rituals[0]?.learnedSanityLoss?.failure, "1D10");

    const families = snapshot.skills.custom
      .filter((skill) => skill.group !== "unarmed_combat")
      .map((skill) => skill.group)
      .sort();
    assert.deepEqual(families, [
      "art",
      "craft",
      "foreign_language",
      "military_science",
      "pilot",
      "science",
    ]);

    assert.equal(snapshot.skills.specialTraining.length, 1);
    assert.deepEqual(snapshot.skills.specialTraining[0]?.uses, {
      kind: "statistic",
      statistic: "strength",
    });
    assert.equal(snapshot.skills.specialTraining[0]?.name, "Special Training");
    assert.ok(
      hasDiagnostic(result, (code) => code === catalogueDiagnosticCodes.missingRecommended),
    );
  });
});

describe("F3–F8 synthetic import matrix (#25)", () => {
  it("imports every non-blocking synthetic into a canonical snapshot", () => {
    for (const name of syntheticFixtureNames()) {
      const result = importFixture(`synthetic/${name}`);
      if (BLOCKING_SYNTHETICS.has(name)) {
        assert.equal(result.blocked, true, `${name} should block`);
        continue;
      }
      assert.equal(result.blocked, false, `${name} should import`);
      parseAgentSnapshot(asSnapshot(result));
    }
  });

  it("F3b warns when a persisted maximum disagrees with the system formula", () => {
    const result = importFixture("synthetic/f3b-persisted-max-disagrees.json");
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    assert.equal(snapshot.resources.hitPoints?.maximum, 10);
    assert.equal(snapshot.resources.willpower?.maximum, 10);
    assert.equal(foundryPartition(snapshot, "raw")["system.health.max"], 99);
    assert.equal(foundryPartition(snapshot, "raw")["system.wp.max"], 42);
    assert.ok(hasDiagnostic(result, (code) => code === catalogueDiagnosticCodes.derivedConflict));
  });

  it("F3c keeps an explicit sub-sentinel sanity current and warns about the POW×5 disagreement", () => {
    const result = importFixture("synthetic/f3c-san-below-sentinel-disagrees.json");
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    assert.deepEqual(snapshot.resources.sanity, { current: 33, maximum: 50 });
    assert.deepEqual(snapshot.resources.breakingPoint, { current: 30, baseline: 30 });
    assert.ok(
      hasDiagnostic(
        result,
        (code, message) =>
          code === catalogueDiagnosticCodes.derivedConflict && message.includes("POW×5"),
      ),
    );
  });

  it("F3e prefers the adapter flag breaking point baseline", () => {
    const snapshot = snapshotOf("synthetic/f3e-breaking-point-flag-baseline.json");
    assert.deepEqual(snapshot.resources.breakingPoint, { current: 25, baseline: 30 });
  });

  it("F3f maps wounds, exhaustion, and first aid", () => {
    const snapshot = snapshotOf("synthetic/f3f-wounds-exhausted-first-aid.json");
    assert.deepEqual(snapshot.resources.wounds, {
      format: "plain",
      content: "Cracked ribs, left side.",
    });
    assert.equal(snapshot.resources.exhausted, true);
    assert.equal(snapshot.resources.firstAidAttempted, true);
  });

  it("F4b imports the Foundry unarmed_combat skill as a custom skill with a known loss", () => {
    const result = importFixture("synthetic/f4b-unarmed-combat-skill.json");
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    const unarmed = snapshot.skills.custom.find((skill) => skill.group === "unarmed_combat");
    assert.equal(unarmed?.proficiency, 65);
    assert.equal(unarmed?.failureMarked, true);
    assert.ok(knownLossFired(result, "unarmed-combat-not-standard"));
  });

  it("F4c normalizes every handbook typed-skill family and records the Foundry keys", () => {
    const snapshot = snapshotOf("synthetic/f4c-typed-skill-families.json");
    const typed = snapshot.skills.custom.filter((skill) => skill.group !== "unarmed_combat");
    assert.deepEqual(
      typed.map((skill) => skill.group).sort(),
      ["art", "craft", "foreign_language", "military_science", "pilot", "science"],
    );
    assert.equal(typed.find((skill) => skill.group === "foreign_language")?.failureMarked, true);
    const bindings = foundryPartition(snapshot, "identity").typedSkills as Record<string, string>;
    assert.deepEqual(Object.values(bindings).sort(), [
      "tskill_01",
      "tskill_02",
      "tskill_03",
      "tskill_04",
      "tskill_05",
      "tskill_06",
    ]);
  });

  it("F4d warns on a typed-skill group outside the handbook families", () => {
    const result = importFixture("synthetic/f4d-typed-skill-unknown-group.json");
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    assert.ok(snapshot.skills.custom.some((skill) => skill.group === "cryptozoology"));
    assert.equal(foundryPartition(snapshot, "raw")["system.typedSkills.tskill_01.group"], "Cryptozoology");
    assert.ok(hasDiagnostic(result, (code) => code === catalogueDiagnosticCodes.safeNormalization));
  });

  it("F4e resolves special training against statistics, standard skills, and typed skills", () => {
    const snapshot = snapshotOf("synthetic/f4e-special-training.json");
    const uses = snapshot.skills.specialTraining.map((entry) => entry.uses.kind).sort();
    assert.deepEqual(uses, ["customSkill", "standardSkill", "statistic", "statistic"]);
    const custom = snapshot.skills.specialTraining.find(
      (entry) => entry.uses.kind === "customSkill",
    );
    assert.ok(custom);
    const chemistry = snapshot.skills.custom.find((skill) => skill.label === "Chemistry");
    assert.equal(
      custom.uses.kind === "customSkill" ? custom.uses.skillId : undefined,
      chemistry?.id,
    );
  });

  it("F4g ignores prepared projections", () => {
    const result = importFixture("synthetic/f4g-prepared-skill-fields.json");
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    const raw = foundryPartition(snapshot, "raw");
    assert.equal(raw["system.skills.firearms.targetProficiency"], undefined);
    assert.equal(raw["system.statistics.str.x5"], undefined);
    assert.equal(snapshot.statistics.strength?.score, 10);
  });

  it("F5c folds a motivation disorder into psychology with the link preserved", () => {
    const snapshot = snapshotOf("synthetic/f5c-motivation-with-disorder.json");
    assert.equal(snapshot.psychology.motivations.length, 1);
    assert.equal(snapshot.psychology.disorders.length, 1);
    assert.equal(snapshot.psychology.disorders[0]?.name, "Post-traumatic stress");
    assert.equal(snapshot.psychology.disorders[0]?.cured, true);
    assert.equal(snapshot.psychology.motivations[0]?.crossedOut, true);
    assert.equal(
      snapshot.psychology.motivations[0]?.linkedDisorderId,
      snapshot.psychology.disorders[0]?.id,
    );
  });

  it("F5d warns when an Item name and description disagree", () => {
    const result = importFixture("synthetic/f5d-name-description-disagreement.json");
    assert.ok(hasDiagnostic(result, (code) => code === catalogueDiagnosticCodes.ambiguousIdentity));
  });

  it("F5e and F5f preserve exact adaptation incident marks", () => {
    const partial = snapshotOf("synthetic/f5e-partial-adaptations.json");
    assert.deepEqual(
      partial.psychology.adaptations.map((entry) => [entry.kind, entry.incidentMarks, entry.adapted]),
      [
        ["violence", 1, false],
        ["helplessness", 2, false],
      ],
    );

    const full = snapshotOf("synthetic/f5f-full-adaptations.json");
    assert.deepEqual(
      full.psychology.adaptations.map((entry) => [entry.kind, entry.incidentMarks, entry.adapted]),
      [
        ["violence", 3, true],
        ["helplessness", 3, true],
      ],
    );
  });

  it("F6 maps each embedded Item type and preserves unknown ones", () => {
    const armorAndGear = snapshotOf("synthetic/f6c-armor-and-gear.json");
    assert.equal(armorAndGear.inventory.armor[0]?.protection, 3);
    assert.equal(armorAndGear.inventory.gear[0]?.expense, "Incidental");

    const tome = snapshotOf("synthetic/f6d-tome.json");
    assert.equal(tome.inventory.tomes[0]?.language, "German");
    assert.equal(tome.inventory.tomes[0]?.revealed, false);
    assert.ok(tome.inventory.tomes[0]?.handlerNotes?.content.includes("Handler only"));
    assert.equal(tome.notes.handler.length, 0);

    const ritual = snapshotOf("synthetic/f6e-ritual.json");
    assert.equal(ritual.inventory.rituals[0]?.complexity, "Simple");
    assert.equal(ritual.inventory.rituals[0]?.learnedSanityLoss?.notes, "Once learned");

    const unknown = importFixture("synthetic/f6f-unknown-item-type.json");
    const unknownSnapshot = parseAgentSnapshot(asSnapshot(unknown));
    assert.ok(foundryPartition(unknownSnapshot, "raw")["items[1]"]);
    assert.ok(
      hasDiagnostic(unknown, (code) => code === catalogueDiagnosticCodes.preservedUnknown),
    );
  });

  it("F6b keeps Foundry-only weapon fields in the extension only", () => {
    const result = importFixture("synthetic/f6b-weapon-extension-fields.json");
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    const grenade = snapshot.inventory.weapons.find((weapon) => weapon.name === "Grenade");
    assert.equal(grenade?.lethality, 20);
    assert.equal(grenade?.skill, "athletics");
    const raw = foundryPartition(snapshot, "raw");
    assert.equal(raw["items[1].system.isLethal"], true);
    assert.equal(raw["items[1].system.customSkillTarget"], 70);
    assert.ok(knownLossFired(result, "weapon-islethal-custom-target-extension-only"));
  });

  it("F7 maps biography, adapter flags, and Impossible Landscapes campaign state", () => {
    const biographyFixture = snapshotOf("synthetic/f7a-biography-full.json");
    assert.equal(biographyFixture.biography.age, 41);
    assert.equal(biographyFixture.biography.education, "BA Criminal Justice");
    assert.equal(biographyFixture.biography.physicalDescription?.format, "html");

    const flags = snapshotOf("synthetic/f7c-flag-dob-and-aliases.json");
    assert.equal(flags.biography.dateOfBirth, "1984-11-02");
    assert.deepEqual(flags.identity.aliases, ["Cardinal", "M. Reyes"]);

    const corruption = snapshotOf("synthetic/f7d-impossible-landscapes.json");
    assert.deepEqual(corruption.campaignState.impossibleLandscapes, {
      corruption: 3,
      seenTheYellowSign: true,
      gift: "The Tatterdemalion's favour",
      insight: "The King in tatters walks the halls.",
    });

    const defaults = snapshotOf("synthetic/f7e-default-corruption.json");
    assert.equal(defaults.campaignState.impossibleLandscapes, undefined);

    const bound = snapshotOf("synthetic/f7f-existing-agent-id.json");
    assert.equal(bound.agentId, "3f2a6c1e-9d4b-4a7e-8c15-2b6d0e5a7f31");
  });

  it("F8f warns that legacy pregen _stats are not exact-target evidence", () => {
    const result = importFixture("synthetic/f8f-legacy-pregen-stats.json");
    assert.equal(result.blocked, false);
    assert.ok(
      hasDiagnostic(
        result,
        (code, _message, sourcePath) =>
          code === catalogueDiagnosticCodes.unverifiedVersion && sourcePath === "/_stats",
      ),
    );
  });

  it("uses the upstream 1,001-Agent corpus only as legacy-provenance evidence", () => {
    const corpusPath = resolve(
      repoRoot,
      "fixtures/upstream/delta-green-foundryvtt-system/v1.7.0/pregens/ARENDT__GEORGE_1JRxGMZ9oXtUmaSg.json",
    );
    const result = importFoundryDeltaGreen(readFileSync(corpusPath), {
      createId: sequentialIdFactory(),
    });
    assert.equal(result.blocked, false);
    assert.ok(
      hasDiagnostic(
        result,
        (code, _message, sourcePath) =>
          code === catalogueDiagnosticCodes.unverifiedVersion && sourcePath === "/_stats",
      ),
      "legacy corpus _stats must not silently claim the exact 14.365 / 1.7.0 target",
    );
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    assert.equal(snapshot.provenance.source.version, "14.365+1.7.0");
    assert.notEqual(snapshot.identity.name, undefined);
  });

  it("F8h preserves an unclassified persisted system path with a warning", () => {
    const result = importFixture("synthetic/f8h-unknown-system-path.json");
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    assert.deepEqual(foundryPartition(snapshot, "raw")["system.mysteryBlock"], {
      unexpected: true,
      note: "not in the 1.7.0 contract",
    });
    assert.ok(hasDiagnostic(result, (code) => code === catalogueDiagnosticCodes.preservedUnknown));
  });
});
