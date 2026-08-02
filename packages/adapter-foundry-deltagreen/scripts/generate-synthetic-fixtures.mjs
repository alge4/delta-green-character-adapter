import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const foundryRoot = join(root, "fixtures/foundry/14.365-deltagreen-1.7.0");
const blankName = "fvtt-Actor-blank-GZGftVGSKSRNSREr.json";
const syntheticDir = join(foundryRoot, "synthetic");
const canonicalDir = join(root, "fixtures/canonical/1.0.0/export-to-foundry");

mkdirSync(syntheticDir, { recursive: true });
mkdirSync(canonicalDir, { recursive: true });

const blank = JSON.parse(readFileSync(join(foundryRoot, blankName), "utf8"));

/** Every import synthetic starts from the pinned blank Actor so defaults stay authentic. */
function actor(name, mutate) {
  const clone = structuredClone(blank);
  clone.name = name;
  clone.prototypeToken.name = name;
  clone._stats.exportSource.uuid = `Actor.synthetic-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  mutate?.(clone);
  return clone;
}

function itemStats() {
  return {
    coreVersion: "14.365",
    systemId: "deltagreen",
    systemVersion: "1.7.0",
    createdTime: 1785553843495,
    modifiedTime: 1785553843534,
    lastModifiedBy: "61Nk4LqGD5F5o62U",
    compendiumSource: null,
    duplicateSource: null,
    exportSource: null,
  };
}

function item(id, name, type, system, extra = {}) {
  return {
    name,
    type,
    img: "systems/deltagreen/assets/icons/swap-bag-black-bg.svg",
    _id: id,
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: itemStats(),
    system,
    ...extra,
  };
}

function typedSkill(label, group, proficiency, failure = false) {
  return { label, group, proficiency, failure };
}

const importFixtures = {
  // F3 — statistics and resources
  "f3a-maxima-agree.json": actor("F3a Maxima Agree", (a) => {
    a.system.statistics.str.value = 14;
    a.system.statistics.con.value = 12;
    a.system.statistics.pow.value = 12;
    a.system.health.value = 13;
    a.system.health.max = 13;
    a.system.wp.value = 12;
    a.system.wp.max = 12;
    a.system.sanity.value = 60;
    a.system.sanity.currentBreakingPoint = 48;
  }),
  "f3b-persisted-max-disagrees.json": actor("F3b Max Disagrees", (a) => {
    a.system.health.max = 99;
    a.system.wp.max = 42;
  }),
  "f3c-san-below-sentinel-disagrees.json": actor("F3c Explicit Sanity", (a) => {
    a.system.sanity.value = 33;
    a.system.sanity.currentBreakingPoint = 30;
  }),
  "f3d-initialization-sentinels.json": actor("F3d Sentinels", (a) => {
    a.system.sanity.value = 100;
    a.system.sanity.currentBreakingPoint = 101;
  }),
  "f3e-breaking-point-flag-baseline.json": actor("F3e Baseline Flag", (a) => {
    a.system.sanity.value = 40;
    a.system.sanity.currentBreakingPoint = 25;
    a.flags = {
      deltaGreenCharacterAdapter: { unrepresentable: { breakingPointBaseline: 30 } },
    };
  }),
  "f3f-wounds-exhausted-first-aid.json": actor("F3f Physical State", (a) => {
    a.system.health.value = 4;
    a.system.physical.wounds = "Cracked ribs, left side.";
    a.system.physical.exhausted = true;
    a.system.physical.firstAidAttempted = true;
  }),

  // F4 — skills
  "f4a-standard-skill-spread.json": actor("F4a Standard Skills", (a) => {
    let step = 0;
    for (const key of Object.keys(a.system.skills)) {
      step = (step + 7) % 90;
      a.system.skills[key].proficiency = step;
    }
    a.system.skills.heavy_machiner.proficiency = 55;
  }),
  "f4b-unarmed-combat-skill.json": actor("F4b Unarmed Combat", (a) => {
    a.system.skills.unarmed_combat.proficiency = 65;
    a.system.skills.unarmed_combat.failure = true;
  }),
  "f4c-typed-skill-families.json": actor("F4c Typed Families", (a) => {
    a.system.typedSkills = {
      tskill_01: typedSkill("Sketching", "Art", 30),
      tskill_02: typedSkill("Locksmith", "Craft", 40),
      tskill_03: typedSkill("Spanish", "Foreign Language", 50, true),
      tskill_04: typedSkill("Land Warfare", "MilitaryScience", 20),
      tskill_05: typedSkill("Helicopter", "Pilot", 25),
      tskill_06: typedSkill("Biology", "Science", 60),
    };
  }),
  "f4d-typed-skill-unknown-group.json": actor("F4d Typed Unknown Group", (a) => {
    a.system.typedSkills = {
      tskill_01: typedSkill("Deep Ones", "Cryptozoology", 15),
      tskill_02: typedSkill("Unlabelled", "", 5),
    };
  }),
  "f4e-special-training.json": actor("F4e Special Training", (a) => {
    a.system.typedSkills = { tskill_01: typedSkill("Chemistry", "Science", 45) };
    a.system.specialTraining = [
      { name: "Iron Grip", attribute: "str", id: "spectrain0000001" },
      { name: "Battlefield Medicine", attribute: "first_aid", id: "spectrain0000002" },
      { name: "Field Chemistry", attribute: "tskill_01", id: "spectrain0000003" },
      { name: "", attribute: "cha", id: "spectrain0000004" },
    ];
  }),
  "f4f-skill-failure-marks.json": actor("F4f Failure Marks", (a) => {
    a.system.skills.firearms.failure = true;
    a.system.skills.occult.failure = true;
    a.system.skills.unnatural.proficiency = 10;
  }),
  "f4g-prepared-skill-fields.json": actor("F4g Prepared Skill Fields", (a) => {
    a.system.skills.firearms.targetProficiency = 40;
    a.system.skills.firearms.cannotBeImprovedByFailure = true;
    a.system.statistics.str.x5 = 50;
    a.system.statistics.str.meleeDamageBonusFormula = "+0";
  }),

  // F5 — psychology and relationships
  "f5a-bonds.json": actor("F5a Bonds", (a) => {
    a.items.push(
      item("bond000000000001", "Rosa Delgado", "bond", {
        description: "<p>Sister, lives in Tucson.</p>",
        score: 13,
        relationship: "Sister",
        hasBeenDamagedSinceLastHomeScene: true,
      }),
      item("bond000000000002", "Field Office", "bond", {
        description: "",
        score: 9,
        relationship: "Colleagues",
        hasBeenDamagedSinceLastHomeScene: false,
      }),
    );
  }),
  "f5b-motivation-without-disorder.json": actor("F5b Motivation", (a) => {
    a.items.push(
      item("motv000000000001", "Prove the truth", "motivation", {
        description: "",
        disorder: "",
        crossedOut: false,
        disorderCured: false,
      }),
    );
  }),
  "f5c-motivation-with-disorder.json": actor("F5c Motivation Disorder", (a) => {
    a.items.push(
      item("motv000000000002", "Protect the innocent", "motivation", {
        description: "",
        disorder: "Post-traumatic stress",
        crossedOut: true,
        disorderCured: true,
      }),
    );
  }),
  "f5d-name-description-disagreement.json": actor("F5d Name Disagreement", (a) => {
    a.items.push(
      item("motv000000000003", "Find the cell", "motivation", {
        description: "<p>Burn the cell to the ground.</p>",
        disorder: "",
        crossedOut: false,
        disorderCured: false,
      }),
      item("bond000000000003", "Marcus", "bond", {
        description: "<p>Ex-partner, no longer speaking.</p>",
        score: 8,
        relationship: "Former partner",
        hasBeenDamagedSinceLastHomeScene: false,
      }),
    );
  }),
  "f5e-partial-adaptations.json": actor("F5e Partial Adaptations", (a) => {
    a.system.sanity.adaptations.violence.incident1 = true;
    a.system.sanity.adaptations.helplessness.incident1 = true;
    a.system.sanity.adaptations.helplessness.incident2 = true;
  }),
  "f5f-full-adaptations.json": actor("F5f Full Adaptations", (a) => {
    for (const kind of ["violence", "helplessness"]) {
      a.system.sanity.adaptations[kind].incident1 = true;
      a.system.sanity.adaptations[kind].incident2 = true;
      a.system.sanity.adaptations[kind].incident3 = true;
    }
  }),

  // F6 — inventory items
  "f6a-unarmed-weapon-variants.json": actor("F6a Unarmed Weapons", (a) => {
    a.items.push(
      item("weap000000000001", "Brass Knuckles", "weapon", {
        description: "",
        skill: "unarmed_combat",
        skillModifier: 10,
        customSkillTarget: 50,
        range: "0M",
        damage: "1D6",
        armorPiercing: 0,
        lethality: 0,
        isLethal: false,
        killRadius: "N/A",
        ammo: "",
        expense: "Standard",
        equipped: true,
      }),
    );
  }),
  "f6b-weapon-extension-fields.json": actor("F6b Weapon Extensions", (a) => {
    a.items.push(
      item("weap000000000002", "Grenade", "weapon", {
        description: "<p>Fragmentation.</p>",
        skill: "athletics",
        skillModifier: 0,
        customSkillTarget: 70,
        range: "20M",
        damage: "",
        armorPiercing: 0,
        lethality: 20,
        isLethal: true,
        killRadius: "5M",
        ammo: "2",
        expense: "Major",
        equipped: false,
      }),
    );
  }),
  "f6c-armor-and-gear.json": actor("F6c Armor And Gear", (a) => {
    a.items.push(
      item("armr000000000001", "Kevlar Vest", "armor", {
        description: "<p>Concealable.</p>",
        protection: 3,
        equipped: true,
        expense: "Standard",
      }),
      item("gear000000000001", "Evidence Kit", "gear", {
        description: "",
        equipped: false,
        expense: "Incidental",
      }),
    );
  }),
  "f6d-tome.json": actor("F6d Tome", (a) => {
    a.items.push(
      item("tome000000000001", "Nameless Cults", "tome", {
        description: "<p>German edition.</p>",
        language: "German",
        studyTime: "6 weeks",
        unnaturalSkillIncrease: 5,
        occultSkillIncrease: 3,
        sanity: { notes: "Cumulative", failedLoss: "1D6", successLoss: "1D4" },
        handlerNotes: "<p>Handler only: the last chapter is a summoning.</p>",
        revealed: false,
      }),
    );
  }),
  "f6e-ritual.json": actor("F6e Ritual", (a) => {
    a.items.push(
      item("ritl000000000001", "Voorish Sign", "ritual", {
        description: "<p>A warding gesture.</p>",
        studyTime: "1 week",
        sanity: { notes: "", failedLoss: "1D10", successLoss: "0" },
        learnedSanity: { notes: "Once learned", failedLoss: "1D4", successLoss: "0" },
        unnaturalSkillIncrease: 1,
        activationCosts: "1 WP",
        activationTime: "1 round",
        complexity: "Simple",
        handlerNotes: "<p>Handler only: reveals invisible things.</p>",
        revealed: true,
      }),
    );
  }),
  "f6f-unknown-item-type.json": actor("F6f Unknown Item", (a) => {
    a.items.push(
      item("unkn000000000001", "Cursed Locket", "trinket", {
        description: "<p>Unknown item type.</p>",
        curse: "unspecified",
      }),
    );
  }),

  // F7 — biography, campaign state, and adapter flags
  "f7a-biography-full.json": actor("F7a Biography", (a) => {
    a.system.biography = {
      profession: "Federal Agent",
      employer: "FBI",
      nationality: "USA",
      sex: "F",
      age: "41",
      education: "BA Criminal Justice",
    };
    a.system.physical.description = "<p>Tall, close-cropped hair, burn scar on the right hand.</p>";
  }),
  "f7b-non-digit-age.json": actor("F7b Non Digit Age", (a) => {
    a.system.biography.age = "thirty-something";
  }),
  "f7c-flag-dob-and-aliases.json": actor("F7c Flag DOB Aliases", (a) => {
    a.flags = {
      deltaGreenCharacterAdapter: {
        unrepresentable: {
          dateOfBirth: "1984-11-02",
          aliases: ["Cardinal", "M. Reyes"],
        },
      },
    };
  }),
  "f7d-impossible-landscapes.json": actor("F7d Impossible Landscapes", (a) => {
    a.system.corruption = {
      value: 3,
      haveSeenTheYellowSign: true,
      gift: "The Tatterdemalion's favour",
      insight: "The King in tatters walks the halls.",
    };
  }),
  "f7e-default-corruption.json": actor("F7e Default Corruption", (a) => {
    a.system.corruption = { value: 0, haveSeenTheYellowSign: false, gift: "", insight: "" };
  }),
  "f7f-existing-agent-id.json": actor("F7f Bound Agent Id", (a) => {
    a.flags = {
      deltaGreenCharacterAdapter: { agentId: "3f2a6c1e-9d4b-4a7e-8c15-2b6d0e5a7f31" },
    };
  }),

  // F8 — version, blocking, and legacy evidence
  "f8a-root-not-object.json": ["not", "an", "actor"],
  "f8b-non-agent-type.json": actor("F8b NPC", (a) => {
    a.type = "npc";
  }),
  "f8c-system-missing.json": { name: "F8c No System", type: "agent", items: [] },
  "f8d-statistic-missing.json": actor("F8d Missing Statistic", (a) => {
    delete a.system.statistics.pow;
  }),
  "f8e-wrong-system-id.json": actor("F8e Wrong System", (a) => {
    a._stats.systemId = "dnd5e";
  }),
  "f8f-legacy-pregen-stats.json": actor("F8f Legacy Pregen", (a) => {
    a._stats.coreVersion = "11.315";
    a._stats.systemVersion = "1.4.2";
    a._stats.exportSource = null;
  }),
  "f8g-prepared-projections.json": actor("F8g Prepared Projections", (a) => {
    a.system.sanity.max = 50;
    a.system.sanity.ritual = 0;
    a.system.sanity.breakingPointHit = false;
    a.system.sanity.adaptations.violence.isAdapted = true;
    a.system.sanity.adaptations.helplessness.isAdapted = false;
    a.system.health.protection = 0;
    for (const key of Object.keys(a.system.statistics)) {
      a.system.statistics[key].x5 = a.system.statistics[key].value * 5;
    }
  }),
  "f8h-unknown-system-path.json": actor("F8h Unknown System Path", (a) => {
    a.system.mysteryBlock = { unexpected: true, note: "not in the 1.7.0 contract" };
  }),
};

const canonicalId = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;

function standardSkill(proficiency, failureMarked = false) {
  return { proficiency, failureMarked };
}

function canonicalBase(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    agentId: canonicalId(1),
    identity: { name: "Export Subject" },
    biography: {},
    statistics: {
      strength: { score: 12 },
      constitution: { score: 11 },
      dexterity: { score: 13 },
      intelligence: { score: 14 },
      power: { score: 11 },
      charisma: { score: 10 },
    },
    resources: {
      hitPoints: { current: 12, maximum: 12 },
      willpower: { current: 11, maximum: 11 },
      sanity: { current: 55, maximum: 55 },
      breakingPoint: { current: 44, baseline: 44 },
    },
    skills: {
      standard: {
        accounting: standardSkill(10),
        firearms: standardSkill(40),
        occult: standardSkill(20),
      },
      custom: [],
      specialTraining: [],
    },
    relationships: { bonds: [] },
    psychology: { motivations: [], disorders: [], adaptations: [] },
    inventory: { weapons: [], armor: [], gear: [], rituals: [], tomes: [] },
    notes: { player: [], handler: [] },
    campaignState: {},
    provenance: {
      adapter: { id: "fixture-authoring", version: "0.0.0" },
      source: { format: "canonical-fixture", version: "1.0.0" },
      contentHash: ZERO_HASH,
    },
    extensions: {},
    ...overrides,
  };
}

const exportFixtures = {
  "f1-minimal-create-new.json": canonicalBase(),
  "f2-full-semantic-agent.json": canonicalBase({
    identity: { name: "REYES, MARISOL", aliases: ["Cardinal", "M. Reyes"] },
    biography: {
      profession: "Federal Agent",
      employer: "FBI",
      nationality: "USA",
      sex: "F",
      age: 41,
      dateOfBirth: "1984-11-02",
      education: "BA Criminal Justice",
      physicalDescription: { format: "html", content: "<p>Tall, burn scar on the right hand.</p>" },
    },
    resources: {
      hitPoints: { current: 7, maximum: 12 },
      willpower: { current: 6, maximum: 11 },
      sanity: { current: 41, maximum: 55 },
      breakingPoint: { current: 30, baseline: 44 },
      wounds: { format: "plain", content: "Cracked ribs, left side." },
      exhausted: true,
      firstAidAttempted: true,
    },
    skills: {
      standard: {
        accounting: standardSkill(10),
        firearms: standardSkill(60, true),
        heavyMachinery: standardSkill(30),
        occult: standardSkill(40),
        unnatural: standardSkill(12, true),
      },
      custom: [
        {
          id: canonicalId(11),
          group: "unarmed_combat",
          label: "Unarmed Combat",
          proficiency: 55,
          failureMarked: false,
        },
        {
          id: canonicalId(12),
          group: "science",
          label: "Biology",
          proficiency: 50,
          failureMarked: false,
        },
        {
          id: canonicalId(13),
          group: "foreign_language",
          label: "Spanish",
          proficiency: 45,
          failureMarked: true,
        },
      ],
      specialTraining: [
        { id: canonicalId(14), name: "Iron Grip", uses: { kind: "statistic", statistic: "strength" } },
        {
          id: canonicalId(15),
          name: "Battlefield Medicine",
          uses: { kind: "standardSkill", skill: "firstAid" },
        },
        {
          id: canonicalId(16),
          name: "Field Chemistry",
          uses: { kind: "customSkill", skillId: canonicalId(12) },
        },
      ],
    },
    relationships: {
      bonds: [
        {
          id: canonicalId(21),
          name: "Rosa Delgado",
          relationship: "Sister",
          description: { format: "html", content: "<p>Lives in Tucson.</p>" },
          score: 13,
          damagedSinceLastHomeScene: true,
        },
      ],
    },
    psychology: {
      motivations: [
        { id: canonicalId(31), statement: "Prove the truth", crossedOut: false, linkedDisorderId: canonicalId(41) },
        { id: canonicalId(32), statement: "Protect the innocent", crossedOut: true },
      ],
      disorders: [
        { id: canonicalId(41), name: "Post-traumatic stress", cured: false },
        { id: canonicalId(42), name: "Insomnia", cured: true },
      ],
      adaptations: [
        { id: canonicalId(51), kind: "violence", incidentMarks: 3, adapted: true },
        { id: canonicalId(52), kind: "helplessness", incidentMarks: 1, adapted: false },
      ],
      traumaticBackground: "hard_experience",
    },
    inventory: {
      weapons: [
        {
          id: canonicalId(61),
          name: "Unarmed Attack",
          skill: "unarmed_combat",
          skillModifier: 0,
          range: "0M",
          damage: "1D4-1",
          armorPiercing: 0,
          lethality: 0,
          killRadius: "N/A",
          ammunition: "",
          expense: "Standard",
          equipped: true,
        },
        {
          id: canonicalId(62),
          name: "Glock 17",
          description: { format: "html", content: "<p>Duty sidearm.</p>" },
          skill: "firearms",
          skillModifier: 0,
          range: "15M",
          damage: "1D10",
          armorPiercing: 3,
          lethality: 0,
          killRadius: "N/A",
          ammunition: "17",
          expense: "Standard",
          equipped: true,
        },
      ],
      armor: [
        {
          id: canonicalId(63),
          name: "Kevlar Vest",
          description: { format: "html", content: "<p>Concealable.</p>" },
          protection: 3,
          expense: "Standard",
          equipped: true,
        },
      ],
      gear: [
        { id: canonicalId(64), name: "Evidence Kit", expense: "Incidental", equipped: false },
      ],
      rituals: [
        {
          id: canonicalId(65),
          name: "Voorish Sign",
          description: { format: "html", content: "<p>A warding gesture.</p>" },
          studyTime: "1 week",
          sanityLoss: { failure: "1D10", success: "0" },
          learnedSanityLoss: { failure: "1D4", success: "0", notes: "Once learned" },
          unnaturalSkillIncrease: 1,
          activationCosts: "1 WP",
          activationTime: "1 round",
          complexity: "Simple",
          handlerNotes: { format: "html", content: "<p>Handler only.</p>" },
          revealed: true,
        },
      ],
      tomes: [
        {
          id: canonicalId(66),
          name: "Nameless Cults",
          description: { format: "html", content: "<p>German edition.</p>" },
          language: "German",
          studyTime: "6 weeks",
          sanityLoss: { failure: "1D6", success: "1D4", notes: "Cumulative" },
          unnaturalSkillIncrease: 5,
          occultSkillIncrease: 3,
          handlerNotes: { format: "html", content: "<p>Handler only.</p>" },
          revealed: false,
        },
      ],
    },
    notes: {
      player: [{ format: "plain", content: "Keep the field notes off the record." }],
      handler: [{ format: "plain", content: "Marisol is closer to the cell than she knows." }],
    },
    campaignState: {
      impossibleLandscapes: {
        corruption: 3,
        seenTheYellowSign: true,
        gift: "The Tatterdemalion's favour",
        insight: "The King in tatters walks the halls.",
      },
    },
  }),

  // F3 — sanity, breaking point, and adaptation edges
  "f3a-sanity-99.json": canonicalBase({
    resources: {
      hitPoints: { current: 12, maximum: 12 },
      willpower: { current: 11, maximum: 11 },
      sanity: { current: 99, maximum: 55 },
      breakingPoint: { current: 44, baseline: 44 },
    },
  }),
  "f3b-sanity-at-sentinel.json": canonicalBase({
    resources: {
      hitPoints: { current: 12, maximum: 12 },
      willpower: { current: 11, maximum: 11 },
      sanity: { current: 104, maximum: 104 },
      breakingPoint: { current: 44, baseline: 44 },
    },
  }),
  "f3c-breaking-point-baseline-differs.json": canonicalBase({
    resources: {
      hitPoints: { current: 12, maximum: 12 },
      willpower: { current: 11, maximum: 11 },
      sanity: { current: 38, maximum: 55 },
      breakingPoint: { current: 27, baseline: 44 },
    },
  }),
  "f3d-adaptation-marks.json": canonicalBase({
    psychology: {
      motivations: [],
      disorders: [],
      adaptations: [
        { id: canonicalId(51), kind: "violence", incidentMarks: 2, adapted: false },
        { id: canonicalId(52), kind: "helplessness", incidentMarks: 0, adapted: false },
      ],
    },
  }),
  "f3e-adapted-without-marks.json": canonicalBase({
    psychology: {
      motivations: [],
      disorders: [],
      adaptations: [{ id: canonicalId(51), kind: "violence", adapted: true }],
    },
  }),
  "f3f-other-adaptation.json": canonicalBase({
    psychology: {
      motivations: [],
      disorders: [],
      adaptations: [
        { id: canonicalId(53), kind: "other", label: "Adapted to bureaucracy", adapted: true },
      ],
    },
  }),

  // F4 — skills export
  "f4a-heavy-machinery.json": canonicalBase({
    skills: {
      standard: { heavyMachinery: standardSkill(55) },
      custom: [],
      specialTraining: [],
    },
  }),
  "f4b-custom-unarmed-combat.json": canonicalBase({
    skills: {
      standard: {},
      custom: [
        {
          id: canonicalId(11),
          group: "unarmed_combat",
          label: "Unarmed Combat",
          proficiency: 65,
          failureMarked: true,
        },
      ],
      specialTraining: [],
    },
  }),
  "f4c-typed-skill-bindings.json": canonicalBase({
    skills: {
      standard: {},
      custom: [
        { id: canonicalId(12), group: "science", label: "Biology", proficiency: 50, failureMarked: false },
        { id: canonicalId(13), group: "art", label: "Sketching", proficiency: 30, failureMarked: false },
      ],
      specialTraining: [],
    },
    extensions: {
      foundry: {
        identity: {
          typedSkills: { [canonicalId(12)]: "tskill_07", [canonicalId(13)]: "tskill_09" },
          items: {},
          specialTraining: {},
          systemOwnedItems: {},
        },
        sheet: {},
        raw: {},
      },
    },
  }),
  "f4d-non-family-custom-group.json": canonicalBase({
    skills: {
      standard: {},
      custom: [
        {
          id: canonicalId(14),
          group: "cryptozoology",
          label: "Deep Ones",
          proficiency: 15,
          failureMarked: false,
        },
      ],
      specialTraining: [],
    },
  }),
  "f4e-unnatural-without-failure.json": canonicalBase({
    skills: {
      standard: { unnatural: standardSkill(12, true) },
      custom: [],
      specialTraining: [],
    },
  }),

  // F6 — narrative formats and extensions
  "f6a-plain-physical-description.json": canonicalBase({
    biography: {
      physicalDescription: {
        format: "plain",
        content: "Weathered & wary.\n\nAlways wears gloves.",
      },
    },
  }),
  "f6b-html-physical-description.json": canonicalBase({
    biography: {
      physicalDescription: { format: "html", content: "<p>Weathered &amp; wary.</p>" },
    },
  }),
  "f6c-foreign-extension-ignored.json": canonicalBase({
    extensions: {
      greenAgentCreator: {
        workflow: { professionKey: "federal_agent" },
        raw: {},
      },
    },
  }),
  "f6d-sheet-extension-restore.json": canonicalBase({
    extensions: {
      foundry: {
        identity: { items: {}, typedSkills: {}, specialTraining: {}, systemOwnedItems: {} },
        sheet: {
          schemaVersion: 1,
          exhaustedPenalty: -30,
          healthMin: 0,
          wpMin: 0,
          settings: {
            sorting: {
              weaponSortAlphabetical: true,
              armorSortAlphabetical: true,
              gearSortAlphabetical: false,
              tomeSortAlphabetical: false,
              ritualSortAlphabetical: false,
            },
            rolling: { defaultPercentileModifier: 10 },
          },
        },
        raw: {},
      },
    },
  }),
};

function writeAll(directory, fixtures) {
  for (const [name, value] of Object.entries(fixtures)) {
    writeFileSync(join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

function checksumLines(directory, relativeNames) {
  return relativeNames.map((name) => {
    const digest = createHash("sha256").update(readFileSync(join(directory, name))).digest("hex");
    return `${digest}  ${name}`;
  });
}

writeAll(syntheticDir, importFixtures);
writeAll(canonicalDir, exportFixtures);

const livePopulated = readdirSync(join(foundryRoot, "live-populated"))
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => `live-populated/${name}`);
const syntheticNames = Object.keys(importFixtures)
  .sort()
  .map((name) => `synthetic/${name}`);

writeFileSync(
  join(foundryRoot, "SHA256SUMS"),
  `${checksumLines(foundryRoot, [blankName, ...livePopulated, ...syntheticNames]).join("\n")}\n`,
  "utf8",
);
writeFileSync(
  join(canonicalDir, "SHA256SUMS"),
  `${checksumLines(canonicalDir, Object.keys(exportFixtures).sort()).join("\n")}\n`,
  "utf8",
);

console.log(
  `Wrote ${Object.keys(importFixtures).length} import synthetics under ${relative(root, syntheticDir)} ` +
    `and ${Object.keys(exportFixtures).length} canonical export fixtures under ${relative(root, canonicalDir)}.`,
);
