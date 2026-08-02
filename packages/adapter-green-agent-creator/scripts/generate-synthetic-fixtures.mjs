import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = join(root, "fixtures/green-agent-creator/5c9e92d/synthetic");
mkdirSync(outDir, { recursive: true });

const baseStats = { STR: 10, CON: 12, DEX: 11, INT: 14, POW: 13, CHA: 9 };

function skill(key, value, extras = {}) {
  return {
    instanceId: `${key}_generic_fix`,
    key,
    typeName: null,
    value,
    baseValueFromProfession: 0,
    increases: 0,
    isProfessional: false,
    isChoiceSkill: false,
    slotId: null,
    ...extras,
  };
}

function typed(key, typeName, value, extras = {}) {
  return skill(key, value, {
    instanceId: `${key}_${typeName.toLowerCase().replace(/\s+/g, "_")}_fix`,
    typeName,
    ...extras,
  });
}

function base(overrides = {}) {
  return {
    professionKey: "federal_agent",
    customProfessionName: "",
    isCustomProfession: false,
    stats: { ...baseStats },
    distinguishingFeatures: {},
    derivedAttributes: { HP: 11, WP: 13, SAN: 65, BP: 52 },
    derivedCurrent: { HP: 11, WP: 13, SAN: 65, BP: 52 },
    bonds: [{ description: "Partner", score: 9 }],
    motivations: ["Stay alive", "", "", "", ""],
    personalInfo: { name: "Synthetic", employer: "Agency", sex: "X", nationality: "US", age: 30, dob: "1990-01-15" },
    traumaticBackground: null,
    traumaticBackgroundEffects: {},
    basePOW: null,
    adaptations: [],
    disorder: null,
    skillFailMarks: [],
    items: [],
    notes: "",
    skills: [skill("accounting", 40), skill("firearms", 50), skill("unarmed_combat", 40)],
    id: "creator-id-1",
    createdDate: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const fixtures = {
  "f2a-stat-roll.json": base({
    statGenerationMethod: "roll",
    rolledStatValues: [15, 14, 12, 11, 10, 9],
    statAssignments: { STR: 15, CON: 14, DEX: 12, INT: 11, POW: 10, CHA: 9 },
    stats: { STR: 15, CON: 14, DEX: 12, INT: 11, POW: 10, CHA: 9 },
    derivedAttributes: { HP: 15, WP: 10, SAN: 50, BP: 40 },
    derivedCurrent: { HP: 15, WP: 10, SAN: 50, BP: 40 },
  }),
  "f2b-stat-pointbuy.json": base({
    statGenerationMethod: "pointbuy",
    stats: { STR: 12, CON: 12, DEX: 12, INT: 12, POW: 12, CHA: 12 },
    derivedAttributes: { HP: 12, WP: 12, SAN: 60, BP: 48 },
    derivedCurrent: { HP: 12, WP: 12, SAN: 60, BP: 48 },
  }),
  "f2c-stat-manual.json": base({
    statGenerationMethod: "manual",
    stats: { STR: 8, CON: 8, DEX: 8, INT: 16, POW: 16, CHA: 16 },
    derivedAttributes: { HP: 8, WP: 16, SAN: 80, BP: 64 },
    derivedCurrent: { HP: 8, WP: 16, SAN: 80, BP: 64 },
  }),
  "f2d-missing-derived.json": (() => {
    const character = base({
      derivedAttributes: {},
      derivedCurrent: {},
    });
    delete character.derivedAttributes;
    delete character.derivedCurrent;
    return character;
  })(),
  "f3a-custom-profession.json": base({
    professionKey: "custom_profession",
    isCustomProfession: true,
    customProfessionName: "Urban Explorer",
    customProfessionBonds: 2,
    customProfessionSkillPointBudget: 300,
    customProfessionSelectedSkills: ["stealth", "search"],
  }),
  "f3b-anthropologist.json": base({ professionKey: "anthropologist_archaeologist_historian" }),
  "f3c-computer-scientist.json": base({ professionKey: "computer_scientist_engineer" }),
  "f3d-federal-agent.json": base({ professionKey: "federal_agent" }),
  "f3e-physician.json": base({ professionKey: "physician" }),
  "f3f-scientist.json": base({ professionKey: "scientist" }),
  "f3g-special-operator.json": base({ professionKey: "special_operator" }),
  "f3h-or-and-typed-slots.json": base({
    professionKey: "scientist",
    orSkillChoices: { science_or_craft: "science" },
    profChoiceSkillSelections: { science: true, accounting: true },
    skills: [
      skill("accounting", 40, { isChoiceSkill: true, isProfessional: true }),
      typed("science", "Biology", 60, { isProfessional: true, slotId: "science_slot" }),
      typed("craft", "Electrician", 40, { isChoiceSkill: true }),
    ],
  }),
  "f3i-unknown-profession.json": base({ professionKey: "deep_cover_librarian" }),
  "f3j-profession-disagreement.json": base({
    professionKey: "federal_agent",
    isCustomProfession: true,
    customProfessionName: "Should not override",
  }),
  "f4a-extreme-violence.json": base({
    traumaticBackground: "extreme_violence",
    adaptations: ["Adapted to Violence"],
    derivedAttributes: { HP: 11, WP: 13, SAN: 60, BP: 47 },
    derivedCurrent: { HP: 11, WP: 13, SAN: 60, BP: 47 },
  }),
  "f4b-captivity-coherent.json": base({
    traumaticBackground: "captivity",
    basePOW: 15,
    stats: { ...baseStats, POW: 10 },
    adaptations: ["Adapted to helplessness"],
    derivedAttributes: { HP: 11, WP: 10, SAN: 70, BP: 60 },
    derivedCurrent: { HP: 11, WP: 10, SAN: 70, BP: 60 },
  }),
  "f4c-captivity-incoherent.json": base({
    traumaticBackground: "captivity",
    basePOW: null,
    adaptations: ["Adapted to helplessness"],
  }),
  "f4d-hard-experience.json": base({
    traumaticBackground: "hard_experience",
    traumaticBackgroundEffects: {
      _effectsApplied: true,
      hardExperienceSkills: ["alertness", "stealth"],
      removedBondIndex: 0,
      removedBond: { description: "Lost friend", score: 9 },
    },
    derivedAttributes: { HP: 11, WP: 13, SAN: 60, BP: 47 },
    derivedCurrent: { HP: 11, WP: 13, SAN: 60, BP: 47 },
  }),
  "f4e-things-man.json": base({
    traumaticBackground: "things_man_was_not_meant_to_know",
    disorder: "Night terrors",
    derivedAttributes: { HP: 11, WP: 13, SAN: 52, BP: 39 },
    derivedCurrent: { HP: 11, WP: 13, SAN: 52, BP: 39 },
  }),
  "f4f-unknown-background.json": base({
    traumaticBackground: "eldritch_internship",
  }),
  "f5a-edited-currents.json": base({
    derivedCurrent: { HP: 3, WP: 5, SAN: 40, BP: 30 },
  }),
  "f5b-fail-marks-resolvable.json": (() => {
    const accounting = skill("accounting", 40);
    return base({
      skills: [accounting, skill("firearms", 50)],
      skillFailMarks: [accounting.instanceId],
    });
  })(),
  "f5c-fail-marks-stale.json": base({
    skillFailMarks: ["missing_instance_zzz"],
  }),
  "f5d-notes.json": base({
    notes: "Keep the USB drive hidden.",
  }),
  "f5e-items-with-interior-empty.json": base({
    items: ["Flashlight", "", "Lockpicks"],
  }),
  "f5f-high-skill-value.json": base({
    skills: [skill("firearms", 95), skill("accounting", 40)],
  }),
  "f6a-typed-skills.json": base({
    skills: [
      typed("art", "Painting", 40),
      typed("foreign_language", "Spanish", 50),
      typed("military_science", "Land", 30),
      typed("pilot", "Helicopter", 20),
      skill("accounting", 10),
    ],
  }),
  "f6b-blank-typed-placeholders.json": base({
    skills: [
      skill("art", 0, { typeName: "", instanceId: "art_generic_blank" }),
      skill("craft", 0, { typeName: "", instanceId: "craft_generic_blank" }),
      skill("accounting", 20),
    ],
  }),
  "f6c-blank-typed-nonzero.json": base({
    skills: [skill("pilot", 25, { typeName: "", instanceId: "pilot_generic_nonzero" })],
  }),
  "f6d-duplicate-typed.json": base({
    skills: [typed("science", "Chemistry", 40), typed("science", "Chemistry", 50, { instanceId: "science_chemistry_dup" })],
  }),
  "f6e-unicode-typename.json": base({
    skills: [typed("foreign_language", "  Español  ", 40)],
  }),
  "f6f-unknown-skill-key.json": base({
    skills: [skill("ritual_dancing", 33)],
  }),
  "f6g-unarmed-combat.json": base({
    skills: [skill("unarmed_combat", 55)],
  }),
  "f7a-many-bonds.json": base({
    bonds: Array.from({ length: 8 }, (_, i) => ({ description: `Bond ${i + 1}`, score: 9 })),
  }),
  "f7b-empty-bond-description.json": base({
    bonds: [{ description: "   ", score: 9 }],
  }),
  "f7c-bond-score-over-cha.json": base({
    bonds: [{ description: "Too close", score: 18 }],
  }),
  "f7d-other-adaptation.json": base({
    adaptations: ["Adapted to bureaucracy"],
  }),
  "f7e-empty-motivations-only.json": base({
    motivations: ["", "", "", "", ""],
  }),
  "f8a-legacy-omitted-optionals.json": {
    stats: { ...baseStats },
    skills: [skill("accounting", 20)],
  },
  "f8b-unknown-roots.json": base({
    mysteryRoot: { foo: 1 },
    personalInfo: {
      name: "Synthetic",
      employer: "Agency",
      sex: "X",
      nationality: "US",
      age: 30,
      dob: "1990-01-15",
      favoriteColor: "chartreuse",
    },
  }),
  "f8c-non-iso-dob.json": base({
    personalInfo: {
      name: "Synthetic",
      employer: "Agency",
      sex: "X",
      nationality: "US",
      age: 30,
      dob: "15/01/1990",
    },
  }),
  "f8d-non-digit-age.json": base({
    personalInfo: {
      name: "Synthetic",
      employer: "Agency",
      sex: "X",
      nationality: "US",
      age: "early thirties",
      dob: "1990-01-15",
    },
  }),
  "f8e-non-object-root.json": ["not", "an", "object"],
  "f8f-bad-stats.json": { stats: "nope", skills: [] },
  "f8g-missing-stat.json": { stats: { STR: 10, CON: 10, DEX: 10, INT: 10, POW: 10 }, skills: [] },
  "f8h-skills-not-array.json": { stats: { ...baseStats }, skills: { accounting: 40 } },
  "f9a-with-creator-id.json": base({
    id: "gac-record-99",
    createdDate: "2025-06-01T12:00:00.000Z",
  }),
  "f9b-without-creator-id.json": (() => {
    const character = base();
    delete character.id;
    delete character.createdDate;
    return character;
  })(),
};

const checksumLines = [];
for (const [name, value] of Object.entries(fixtures)) {
  const path = join(outDir, name);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, body, "utf8");
  const digest = createHash("sha256").update(body).digest("hex");
  checksumLines.push(`${digest}  synthetic/${name}`);
}

const calebPath = join(root, "fixtures/green-agent-creator/5c9e92d/caleb.json");
const calebBytes = readFileSync(calebPath);
const calebDigest = createHash("sha256").update(calebBytes).digest("hex");
checksumLines.unshift(`${calebDigest}  caleb.json`);

const sumsPath = join(root, "fixtures/green-agent-creator/5c9e92d/SHA256SUMS");
writeFileSync(sumsPath, `${checksumLines.join("\n")}\n`, "utf8");
console.log(`Wrote ${Object.keys(fixtures).length} synthetics and SHA256SUMS under ${relative(root, outDir)}`);
