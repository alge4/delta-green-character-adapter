import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogueDiagnosticCodes } from "@delta-green-character-adapter/adapter-core";
import type { JsonValue } from "@delta-green-character-adapter/character-model";

import { exportFoundryDeltaGreen } from "../src/index.js";
import {
  actorItems,
  actorSystem,
  asActor,
  canonicalFixtureNames,
  hasDiagnostic,
  knownLossFired,
  readCanonicalFixture,
  sequentialIdFactory,
} from "./helpers.js";

function exportFixture(name: string) {
  return exportFoundryDeltaGreen(readCanonicalFixture(name), {
    createId: sequentialIdFactory(),
  });
}

function record(value: JsonValue | undefined): Record<string, JsonValue> {
  assert.ok(value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, JsonValue>;
}

function adapterFlags(actor: Record<string, JsonValue>): Record<string, JsonValue> {
  return record(record(actor.flags).deltaGreenCharacterAdapter);
}

// F5 (merge / Replace / Synchronize policy fixtures) is deliberately waived here: those
// fixtures assert Update Plan selection defaults from issues #7 and #10, which belong to the
// update planner (#26). This capability only builds create-new Actor source data.
describe("canonical → Foundry export matrix F1–F4 and F6 (#25)", () => {
  it("emits create-new Actor source data for every canonical fixture", () => {
    for (const name of canonicalFixtureNames()) {
      const result = exportFixture(name);
      assert.equal(result.blocked, false, `${name} should export`);
      const actor = asActor(result);
      assert.equal(actor.type, "agent");
      for (const forbidden of ["_id", "_stats", "ownership", "folder", "sort", "prototypeToken", "effects"]) {
        assert.equal(forbidden in actor, false, `${name} must not write ${forbidden}`);
      }
      const system = actorSystem(actor);
      assert.equal("max" in record(system.sanity), false, `${name} must not write prepared sanity.max`);
      const unarmed = actorItems(actor).filter((item) => item.name === "Unarmed Attack");
      assert.equal(unarmed.length, 1, `${name} must contain exactly one Unarmed Attack`);
      assert.deepEqual(record(record(unarmed[0]!.flags).deltagreen), {
        AutoAdded: true,
        SystemName: "unarmed-attack",
      });
    }
  });

  it("blocks input that does not parse as canonical Agent 1.0.0", () => {
    const result = exportFoundryDeltaGreen({ schemaVersion: "0.9.0" });
    assert.equal(result.blocked, true);
    assert.equal(result.output, undefined);
    assert.ok(
      result.diagnostics.some((entry) => entry.code === catalogueDiagnosticCodes.malformedStructure),
    );
  });

  it("F1 writes formula maxima, system skill defaults, and the adapter agent binding", () => {
    const result = exportFixture("f1-minimal-create-new.json");
    const actor = asActor(result);
    const system = actorSystem(actor);

    assert.equal(actor.name, "Export Subject");
    assert.deepEqual(record(system.health), { min: 0, value: 12, max: 12 });
    assert.deepEqual(record(system.wp), { min: 0, value: 11, max: 11 });
    assert.equal(record(system.sanity).value, 55);
    assert.equal(record(system.sanity).currentBreakingPoint, 44);
    assert.equal(record(record(system.statistics).str).value, 12);
    assert.equal(record(record(system.skills).firearms).proficiency, 40);
    // Untouched standard skills keep the Delta Green persisted defaults.
    assert.equal(record(record(system.skills).athletics).proficiency, 30);
    assert.equal(record(record(system.skills).unarmed_combat).proficiency, 40);
    assert.equal(adapterFlags(actor).agentId, "00000000-0000-4000-8000-000000000001");
    assert.equal(record(adapterFlags(actor).unrepresentable).breakingPointBaseline, 44);
  });

  it("F2 writes the full semantic Agent and parks unrepresentable fields in flags", () => {
    const result = exportFixture("f2-full-semantic-agent.json");
    const actor = asActor(result);
    const system = actorSystem(actor);
    const items = actorItems(actor);

    assert.equal(actor.name, "REYES, MARISOL");
    assert.equal(record(system.biography).age, "41");
    assert.equal(record(system.biography).profession, "Federal Agent");
    assert.equal(record(system.physical).description, "<p>Tall, burn scar on the right hand.</p>");
    assert.equal(record(system.physical).wounds, "Cracked ribs, left side.");
    assert.equal(record(system.physical).exhausted, true);
    assert.equal(record(record(system.skills).heavy_machiner).proficiency, 30);
    assert.equal(record(record(system.skills).unarmed_combat).proficiency, 55);
    assert.equal(record(record(system.corruption)).value, 3);

    assert.deepEqual(record(record(system.sanity).adaptations), {
      violence: { incident1: true, incident2: true, incident3: true },
      helplessness: { incident1: true, incident2: false, incident3: false },
    });

    const typedSkills = record(system.typedSkills);
    assert.equal(Object.keys(typedSkills).length, 2);
    const groups = Object.values(typedSkills).map((entry) => record(entry).group).sort();
    assert.deepEqual(groups, ["Foreign Language", "Science"]);

    const specialTraining = system.specialTraining as Array<Record<string, JsonValue>>;
    assert.deepEqual(
      specialTraining.map((entry) => entry.attribute).sort(),
      ["first_aid", "str", "tskill_01"],
    );

    const byType = (type: string) => items.filter((item) => item.type === type);
    assert.equal(byType("weapon").length, 2);
    assert.equal(byType("armor").length, 1);
    assert.equal(byType("gear").length, 1);
    assert.equal(byType("tome").length, 1);
    assert.equal(byType("ritual").length, 1);
    assert.equal(byType("bond").length, 1);
    // Two linked motivations plus one synthesized Item for the unlinked disorder.
    assert.equal(byType("motivation").length, 3);
    assert.ok(knownLossFired(result, "unlinked-disorder-normalization"));

    const flags = adapterFlags(actor);
    const unrepresentable = record(flags.unrepresentable);
    assert.equal(unrepresentable.dateOfBirth, "1984-11-02");
    assert.deepEqual(unrepresentable.aliases, ["Cardinal", "M. Reyes"]);
    assert.equal(unrepresentable.breakingPointBaseline, 44);
    assert.equal(unrepresentable.traumaticBackground, "hard_experience");
    assert.ok(record(unrepresentable.notes).player);
    assert.ok(knownLossFired(result, "dob-aliases-notes-in-flags-only"));
  });

  it("F3a keeps a sub-sentinel sanity current and F3b normalizes at the sentinel", () => {
    const below = asActor(exportFixture("f3a-sanity-99.json"));
    assert.equal(record(actorSystem(below).sanity).value, 99);

    const atSentinel = exportFixture("f3b-sanity-at-sentinel.json");
    assert.equal(record(actorSystem(asActor(atSentinel)).sanity).value, 55);
    assert.ok(knownLossFired(atSentinel, "san-cannot-persist-ge-100"));
  });

  it("F3c always writes the breaking point baseline flag", () => {
    const actor = asActor(exportFixture("f3c-breaking-point-baseline-differs.json"));
    assert.equal(record(actorSystem(actor).sanity).currentBreakingPoint, 27);
    assert.equal(record(adapterFlags(actor).unrepresentable).breakingPointBaseline, 44);
  });

  it("F3d prefers incident marks and F3e synthesizes them from adapted", () => {
    const marks = asActor(exportFixture("f3d-adaptation-marks.json"));
    assert.deepEqual(record(record(actorSystem(marks).sanity).adaptations), {
      violence: { incident1: true, incident2: true, incident3: false },
      helplessness: { incident1: false, incident2: false, incident3: false },
    });

    const synthesized = exportFixture("f3e-adapted-without-marks.json");
    assert.deepEqual(
      record(record(actorSystem(asActor(synthesized)).sanity).adaptations).violence,
      { incident1: true, incident2: true, incident3: true },
    );
    assert.ok(knownLossFired(synthesized, "adaptation-marks-synthesized-from-adapted-flag"));
  });

  it("F3f parks kind=other adaptations in flags with a warning", () => {
    const result = exportFixture("f3f-other-adaptation.json");
    const actor = asActor(result);
    const parked = record(adapterFlags(actor).unrepresentable).otherAdaptations;
    assert.deepEqual(parked, [{ label: "Adapted to bureaucracy", adapted: true }]);
    assert.ok(knownLossFired(result, "other-adaptations-not-in-system"));
    assert.deepEqual(record(record(actorSystem(actor).sanity).adaptations).violence, {
      incident1: false,
      incident2: false,
      incident3: false,
    });
  });

  it("F4a writes the historical heavy_machiner key", () => {
    const actor = asActor(exportFixture("f4a-heavy-machinery.json"));
    assert.equal(record(record(actorSystem(actor).skills).heavy_machiner).proficiency, 55);
    assert.equal("heavyMachinery" in record(actorSystem(actor).skills), false);
  });

  it("F4b routes a custom unarmed_combat skill to the Foundry standard skill key", () => {
    const actor = asActor(exportFixture("f4b-custom-unarmed-combat.json"));
    const skills = record(actorSystem(actor).skills);
    assert.deepEqual(record(skills.unarmed_combat), {
      proficiency: 65,
      label: "Unarmed Combat",
      failure: true,
    });
    assert.deepEqual(actorSystem(actor).typedSkills, {});
  });

  it("F4c reuses bound typed-skill keys", () => {
    const actor = asActor(exportFixture("f4c-typed-skill-bindings.json"));
    const typedSkills = record(actorSystem(actor).typedSkills);
    assert.deepEqual(Object.keys(typedSkills).sort(), ["tskill_07", "tskill_09"]);
    assert.equal(record(typedSkills.tskill_07).label, "Biology");
    assert.equal(record(typedSkills.tskill_09).group, "Art");
  });

  it("F4d warns when a custom group is not a handbook family", () => {
    const result = exportFixture("f4d-non-family-custom-group.json");
    const typedSkills = record(actorSystem(asActor(result)).typedSkills);
    assert.equal(record(typedSkills.tskill_01).group, "cryptozoology");
    assert.ok(hasDiagnostic(result, (code) => code === catalogueDiagnosticCodes.safeNormalization));
  });

  it("F4e omits the failure field for unnatural", () => {
    const actor = asActor(exportFixture("f4e-unnatural-without-failure.json"));
    const unnatural = record(record(actorSystem(actor).skills).unnatural);
    assert.deepEqual(unnatural, { proficiency: 12, label: "Unnatural" });
  });

  it("F6a converts plain narrative to HTML and F6b passes HTML through", () => {
    const plain = exportFixture("f6a-plain-physical-description.json");
    assert.equal(
      record(actorSystem(asActor(plain)).physical).description,
      "<p>Weathered &amp; wary.</p><p>Always wears gloves.</p>",
    );
    assert.ok(knownLossFired(plain, "narrative-format-conversion"));

    const html = exportFixture("f6b-html-physical-description.json");
    assert.equal(
      record(actorSystem(asActor(html)).physical).description,
      "<p>Weathered &amp; wary.</p>",
    );
    assert.equal(knownLossFired(html, "narrative-format-conversion"), false);
  });

  it("F6c ignores foreign adapter extensions and F6d restores Foundry sheet knobs", () => {
    const foreign = exportFixture("f6c-foreign-extension-ignored.json");
    const foreignActor = asActor(foreign);
    assert.equal(
      "greenAgentCreator" in record(foreignActor.flags),
      false,
      "foreign extensions must not reach the Actor",
    );
    assert.equal(record(actorSystem(foreignActor).biography).profession, "");
    assert.ok(knownLossFired(foreign, "foreign-extensions-not-exported"));

    const restored = asActor(exportFixture("f6d-sheet-extension-restore.json"));
    assert.equal(record(actorSystem(restored).physical).exhaustedPenalty, -30);
    assert.equal(
      record(record(record(actorSystem(restored).settings).sorting)).weaponSortAlphabetical,
      true,
    );
    assert.equal(record(record(actorSystem(restored).settings).rolling).defaultPercentileModifier, 10);
  });
});
