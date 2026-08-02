import type { StandardSkillId } from "@delta-green-character-adapter/character-model";

export const IMPORT_ADAPTER_ID = "foundry-deltagreen-import" as const;
export const EXPORT_ADAPTER_ID = "foundry-deltagreen-export" as const;
export const FOUNDRY_FORMAT = "foundry-deltagreen" as const;
export const FOUNDRY_VERSION = "14.365+1.7.0" as const;
export const CORE_VERSION = "14.365" as const;
export const SYSTEM_ID = "deltagreen" as const;
export const SYSTEM_VERSION = "1.7.0" as const;
export const SYSTEM_COMMIT = "7d86f90e1d25d47a316b94e072b14a34ca80366b" as const;

export const IMPORT_CAPABILITY_ID = "foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0" as const;
export const EXPORT_CAPABILITY_ID = "canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0" as const;

export const ADAPTER_FLAG_NAMESPACE = "deltaGreenCharacterAdapter" as const;
export const SYSTEM_FLAG_NAMESPACE = "deltagreen" as const;

export const CANONICAL_STAT_IDS = [
  "strength",
  "constitution",
  "dexterity",
  "intelligence",
  "power",
  "charisma",
] as const;
export type CanonicalStatId = (typeof CANONICAL_STAT_IDS)[number];

export const FOUNDRY_STAT_KEYS = ["str", "con", "dex", "int", "pow", "cha"] as const;
export type FoundryStatKey = (typeof FOUNDRY_STAT_KEYS)[number];

export const STAT_KEY_MAP: Readonly<Record<FoundryStatKey, CanonicalStatId>> = {
  str: "strength",
  con: "constitution",
  dex: "dexterity",
  int: "intelligence",
  pow: "power",
  cha: "charisma",
};

export const REVERSE_STAT_KEY_MAP: Readonly<Record<CanonicalStatId, FoundryStatKey>> = {
  strength: "str",
  constitution: "con",
  dexterity: "dex",
  intelligence: "int",
  power: "pow",
  charisma: "cha",
};

/** Foundry persists Heavy Machinery under the historical `heavy_machiner` typo. */
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
  heavy_machiner: "heavyMachinery",
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

export const REVERSE_SKILL_KEY_MAP: Readonly<Record<StandardSkillId, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(SKILL_KEY_MAP).map(([foundryKey, canonicalId]) => [canonicalId, foundryKey]),
  ) as Record<StandardSkillId, string>,
);

export const UNARMED_COMBAT_SKILL_KEY = "unarmed_combat" as const;
export const UNARMED_COMBAT_GROUP = "unarmed_combat" as const;
export const UNARMED_COMBAT_LABEL = "Unarmed Combat" as const;
export const UNARMED_ATTACK_ITEM_NAME = "Unarmed Attack" as const;
export const UNARMED_ATTACK_SYSTEM_NAME = "unarmed-attack" as const;
export const UNARMED_COMBAT_DEFAULT_PROFICIENCY = 40;

/** Persisted defaults observed on the pinned blank Actor export. */
export const STANDARD_SKILL_DEFAULTS: ReadonlyArray<
  readonly [key: string, label: string, proficiency: number]
> = [
  ["accounting", "Accounting", 10],
  ["alertness", "Alertness", 20],
  ["anthropology", "Anthropology", 0],
  ["archeology", "Archeology", 0],
  ["artillery", "Artillery", 0],
  ["athletics", "Athletics", 30],
  ["bureaucracy", "Bureaucracy", 10],
  ["computer_science", "Computer Science", 0],
  ["criminology", "Criminology", 10],
  ["demolitions", "Demolitions", 0],
  ["disguise", "Disguise", 10],
  ["dodge", "Dodge", 30],
  ["drive", "Drive", 20],
  ["firearms", "Firearms", 20],
  ["first_aid", "First Aid", 10],
  ["forensics", "Forensics", 0],
  ["heavy_machiner", "Heavy Machinery", 10],
  ["heavy_weapons", "Heavy Weapons", 0],
  ["history", "History", 10],
  ["humint", "HUMINT", 10],
  ["law", "Law", 0],
  ["medicine", "Medicine", 0],
  ["melee_weapons", "Melee Weapons", 30],
  ["navigate", "Navigate", 10],
  ["occult", "Occult", 10],
  ["persuade", "Persuade", 20],
  ["pharmacy", "Pharmacy", 0],
  ["psychotherapy", "Psychotherapy", 10],
  ["ride", "Ride", 10],
  ["search", "Search", 20],
  ["sigint", "SIGINT", 0],
  ["stealth", "Stealth", 10],
  ["surgery", "Surgery", 0],
  ["survival", "Survival", 10],
  ["swim", "Swim", 20],
  ["unarmed_combat", UNARMED_COMBAT_LABEL, 40],
  ["unnatural", "Unnatural", 0],
];

/** `unnatural` omits `failure` in the DG 1.7.0 human-skills schema. */
export const SKILL_KEYS_WITHOUT_FAILURE: ReadonlySet<string> = new Set(["unnatural"]);

export const TYPED_SKILL_FAMILIES = [
  "art",
  "craft",
  "foreign_language",
  "military_science",
  "pilot",
  "science",
] as const;
export type TypedSkillFamily = (typeof TYPED_SKILL_FAMILIES)[number];

export const TYPED_SKILL_FAMILY_SET: ReadonlySet<string> = new Set(TYPED_SKILL_FAMILIES);

/** Foundry writes typed-skill groups as display text; canonical stores handbook family ids. */
export const TYPED_SKILL_FAMILY_LABELS: Readonly<Record<TypedSkillFamily, string>> = {
  art: "Art",
  craft: "Craft",
  foreign_language: "Foreign Language",
  military_science: "Military Science",
  pilot: "Pilot",
  science: "Science",
};

export const SAN_SENTINEL_MINIMUM = 100;
export const BREAKING_POINT_SENTINEL = 101;
export const DEFAULT_EXHAUSTED_PENALTY = -20;
export const DEFAULT_SCHEMA_VERSION = 1;

export const DEFAULT_SHEET_SETTINGS = {
  sorting: {
    weaponSortAlphabetical: false,
    armorSortAlphabetical: false,
    gearSortAlphabetical: false,
    tomeSortAlphabetical: false,
    ritualSortAlphabetical: false,
  },
  rolling: {
    defaultPercentileModifier: 20,
  },
} as const;

export const UNARMED_ATTACK_SYSTEM_DEFAULTS = {
  description: "",
  skill: UNARMED_COMBAT_SKILL_KEY,
  range: "0M",
  damage: "1D4-1",
  armorPiercing: 0,
  lethality: 0,
  isLethal: false,
  killRadius: "N/A",
  ammo: "",
  expense: "Standard",
  skillModifier: 0,
  customSkillTarget: 50,
  equipped: true,
} as const;

export const ADAPTATION_KINDS = ["violence", "helplessness"] as const;
export type FoundryAdaptationKind = (typeof ADAPTATION_KINDS)[number];

export const MAPPED_ITEM_TYPES = [
  "bond",
  "motivation",
  "weapon",
  "armor",
  "gear",
  "tome",
  "ritual",
] as const;
export type MappedItemType = (typeof MAPPED_ITEM_TYPES)[number];

export const MAPPED_ITEM_TYPE_SET: ReadonlySet<string> = new Set(MAPPED_ITEM_TYPES);

/** Persisted `system` fields the adapter classifies for each embedded Item type. */
export const ITEM_SYSTEM_FIELDS: Readonly<Record<MappedItemType, readonly string[]>> = {
  bond: ["description", "score", "relationship", "hasBeenDamagedSinceLastHomeScene"],
  motivation: ["description", "disorder", "crossedOut", "disorderCured"],
  weapon: [
    "description",
    "skill",
    "skillModifier",
    "customSkillTarget",
    "range",
    "damage",
    "armorPiercing",
    "lethality",
    "isLethal",
    "killRadius",
    "ammo",
    "expense",
    "equipped",
  ],
  armor: ["description", "protection", "equipped", "expense"],
  gear: ["description", "equipped", "expense"],
  tome: [
    "description",
    "language",
    "studyTime",
    "unnaturalSkillIncrease",
    "occultSkillIncrease",
    "sanity",
    "sanity.notes",
    "sanity.failedLoss",
    "sanity.successLoss",
    "handlerNotes",
    "revealed",
  ],
  ritual: [
    "description",
    "studyTime",
    "sanity",
    "sanity.notes",
    "sanity.failedLoss",
    "sanity.successLoss",
    "learnedSanity",
    "learnedSanity.notes",
    "learnedSanity.failedLoss",
    "learnedSanity.successLoss",
    "unnaturalSkillIncrease",
    "activationCosts",
    "activationTime",
    "complexity",
    "handlerNotes",
    "revealed",
  ],
};

/** Foundry-owned Document metadata carried on every embedded Item. */
export const ITEM_CORE_KEYS: ReadonlySet<string> = new Set([
  "_id",
  "_stats",
  "name",
  "type",
  "img",
  "effects",
  "flags",
  "folder",
  "sort",
  "ownership",
  "system",
]);

export const ACTOR_ROOT_KEYS: ReadonlySet<string> = new Set([
  "_id",
  "_stats",
  "name",
  "type",
  "img",
  "effects",
  "flags",
  "folder",
  "sort",
  "ownership",
  "prototypeToken",
  "system",
  "items",
]);

export const SYSTEM_ROOT_KEYS: ReadonlySet<string> = new Set([
  "health",
  "wp",
  "statistics",
  "settings",
  "skills",
  "typedSkills",
  "specialTraining",
  "schemaVersion",
  "sanity",
  "physical",
  "biography",
  "corruption",
]);

/**
 * Values written by the system `prepareData` pass. They are projections of persisted
 * source data and must never be read as independent facts.
 */
export const PREPARED_ONLY_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  "system.health": new Set(["protection"]),
  "system.wp": new Set([]),
  "system.statistics.<stat>": new Set(["x5", "meleeDamageBonusFormula"]),
  "system.skills.<key>": new Set(["targetProficiency", "cannotBeImprovedByFailure"]),
  "system.sanity": new Set(["max", "ritual", "breakingPointHit"]),
  "system.sanity.adaptations.<kind>": new Set(["isAdapted"]),
};

export const STATISTIC_KEYS: ReadonlySet<string> = new Set(["value", "distinguishing_feature"]);
export const RESOURCE_KEYS: ReadonlySet<string> = new Set(["min", "value", "max"]);
export const SKILL_ENTRY_KEYS: ReadonlySet<string> = new Set(["proficiency", "label", "failure"]);
export const TYPED_SKILL_ENTRY_KEYS: ReadonlySet<string> = new Set([
  "proficiency",
  "label",
  "failure",
  "group",
]);
export const SANITY_LOSS_KEYS: ReadonlySet<string> = new Set([
  "notes",
  "failedLoss",
  "successLoss",
]);
export const SANITY_KEYS: ReadonlySet<string> = new Set([
  "value",
  "currentBreakingPoint",
  "adaptations",
]);
export const ADAPTATION_ENTRY_KEYS: ReadonlySet<string> = new Set([
  "incident1",
  "incident2",
  "incident3",
]);
export const PHYSICAL_KEYS: ReadonlySet<string> = new Set([
  "description",
  "wounds",
  "firstAidAttempted",
  "exhausted",
  "exhaustedPenalty",
]);
export const BIOGRAPHY_KEYS: ReadonlySet<string> = new Set([
  "profession",
  "employer",
  "nationality",
  "sex",
  "age",
  "education",
]);
export const CORRUPTION_KEYS: ReadonlySet<string> = new Set([
  "value",
  "haveSeenTheYellowSign",
  "gift",
  "insight",
]);
