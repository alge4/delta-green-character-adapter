import type { StandardSkillId } from "@delta-green-character-adapter/character-model";

export const ADAPTER_ID = "green-agent-creator-import" as const;
export const SOURCE_FORMAT = "green-agent-creator" as const;
export const SOURCE_VERSION = "5c9e92d" as const;
export const CAPABILITY_ID = "green-agent-creator-5c9e92d-to-canonical-1.0.0" as const;

export const STAT_KEYS = ["STR", "CON", "DEX", "INT", "POW", "CHA"] as const;
export type GacStatKey = (typeof STAT_KEYS)[number];

export const STAT_KEY_MAP: Record<GacStatKey, "strength" | "constitution" | "dexterity" | "intelligence" | "power" | "charisma"> =
  {
    STR: "strength",
    CON: "constitution",
    DEX: "dexterity",
    INT: "intelligence",
    POW: "power",
    CHA: "charisma",
  };

export const PROFESSION_KEY_MAP: Readonly<Record<string, string>> = {
  anthropologist_archaeologist_historian: "Anthropologist, Archaeologist, or Historian",
  computer_scientist_engineer: "Computer Scientist or Engineer",
  federal_agent: "Federal Agent",
  physician: "Physician",
  scientist: "Scientist",
  special_operator: "Special Operator",
};

export const SKILL_KEY_MAP: Readonly<Record<string, StandardSkillId>> = {
  accounting: "accounting",
  alertness: "alertness",
  anthropology: "anthropology",
  archeology: "archeology",
  artillery: "artillery",
  athletics: "athletics",
  bureaucracy: "bureaucracy",
  computer_science: "computerScience",
  criminology: "criminology",
  demolitions: "demolitions",
  disguise: "disguise",
  dodge: "dodge",
  drive: "drive",
  firearms: "firearms",
  first_aid: "firstAid",
  forensics: "forensics",
  heavy_machinery: "heavyMachinery",
  heavy_weapons: "heavyWeapons",
  history: "history",
  humint: "humint",
  law: "law",
  medicine: "medicine",
  melee_weapons: "meleeWeapons",
  navigate: "navigate",
  occult: "occult",
  persuade: "persuade",
  pharmacy: "pharmacy",
  psychotherapy: "psychotherapy",
  ride: "ride",
  search: "search",
  sigint: "sigint",
  stealth: "stealth",
  surgery: "surgery",
  survival: "survival",
  swim: "swim",
  unnatural: "unnatural",
};

export const TYPED_SKILL_FAMILIES = new Set([
  "art",
  "craft",
  "foreign_language",
  "military_science",
  "pilot",
  "science",
]);

export const KNOWN_TRAUMATIC_BACKGROUNDS = new Set([
  "extreme_violence",
  "captivity",
  "hard_experience",
  "things_man_was_not_meant_to_know",
]);

export const WORKFLOW_ROOT_KEYS = [
  "customProfessionBonds",
  "customProfessionSkillPointBudget",
  "customProfessionSelectedSkills",
  "customProfessionSetupStage",
  "skillBoostsUsed",
  "orSkillChoices",
  "profChoiceSkillSelections",
  "statGenerationMethod",
  "statArrayChoice",
  "rolledStatValues",
  "statAssignments",
  "traumaticBackgroundEffects",
  "professionKey",
  "isCustomProfession",
  "customProfessionName",
  "basePOW",
] as const;

export const KNOWN_ROOT_KEYS = new Set([
  "personalInfo",
  "professionKey",
  "customProfessionName",
  "isCustomProfession",
  "customProfessionBonds",
  "customProfessionSkillPointBudget",
  "customProfessionSelectedSkills",
  "customProfessionSetupStage",
  "skillBoostsUsed",
  "orSkillChoices",
  "profChoiceSkillSelections",
  "statGenerationMethod",
  "statArrayChoice",
  "rolledStatValues",
  "statAssignments",
  "stats",
  "distinguishingFeatures",
  "derivedAttributes",
  "derivedCurrent",
  "bonds",
  "motivations",
  "traumaticBackground",
  "traumaticBackgroundEffects",
  "basePOW",
  "adaptations",
  "disorder",
  "items",
  "notes",
  "skills",
  "skillFailMarks",
  "sheetBaseline",
  "id",
  "createdDate",
  "meta",
  "version",
]);

export const PERSONAL_INFO_KEYS = new Set(["name", "employer", "nationality", "sex", "age", "dob"]);
