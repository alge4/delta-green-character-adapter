import * as z from "zod";

export const AGENT_SCHEMA_VERSION = "1.0.0" as const;

const strictObject = z.strictObject;
const optionalText = z.string().optional();
const proficiency = z.number().int();
const lowerUuidV4 = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    "Expected a lowercase UUID v4",
  );

export const canonicalIdSchema = lowerUuidV4.meta({
  description: "Source-independent canonical identity generated as a UUID v4.",
});

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    jsonPrimitiveSchema,
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const narrativeTextSchema = strictObject({
  format: z.enum(["plain", "markdown", "html"]),
  content: z.string(),
});

const statisticSchema = strictObject({
  score: z.number().int(),
  distinguishingFeature: optionalText,
});

const mutableResourceSchema = strictObject({
  current: z.number().int(),
  maximum: z.number().int(),
});

export const STANDARD_SKILL_IDS = [
  "accounting",
  "alertness",
  "anthropology",
  "archeology",
  "artillery",
  "athletics",
  "bureaucracy",
  "computerScience",
  "criminology",
  "demolitions",
  "disguise",
  "dodge",
  "drive",
  "firearms",
  "firstAid",
  "forensics",
  "heavyMachinery",
  "heavyWeapons",
  "history",
  "humint",
  "law",
  "medicine",
  "meleeWeapons",
  "navigate",
  "occult",
  "persuade",
  "pharmacy",
  "psychotherapy",
  "ride",
  "search",
  "sigint",
  "stealth",
  "surgery",
  "survival",
  "swim",
  "unnatural",
] as const;
export const standardSkillIdSchema = z.enum(STANDARD_SKILL_IDS);
export type StandardSkillId = z.infer<typeof standardSkillIdSchema>;

const standardSkillSchema = strictObject({
  proficiency,
  failureMarked: z.boolean(),
});

const customSkillSchema = strictObject({
  id: canonicalIdSchema,
  group: z.string().min(1),
  label: z.string().min(1),
  proficiency,
  failureMarked: z.boolean(),
});

const specialTrainingSchema = strictObject({
  id: canonicalIdSchema,
  name: z.string().min(1),
  uses: z.discriminatedUnion("kind", [
    strictObject({ kind: z.literal("statistic"), statistic: z.enum(["strength", "constitution", "dexterity", "intelligence", "power", "charisma"]) }),
    strictObject({ kind: z.literal("standardSkill"), skill: standardSkillIdSchema }),
    strictObject({ kind: z.literal("customSkill"), skillId: canonicalIdSchema }),
  ]),
});

const bondSchema = strictObject({
  id: canonicalIdSchema,
  name: z.string().min(1),
  relationship: optionalText,
  description: narrativeTextSchema.optional(),
  score: z.number().int(),
  damagedSinceLastHomeScene: z.boolean(),
});

const motivationSchema = strictObject({
  id: canonicalIdSchema,
  statement: z.string().min(1),
  crossedOut: z.boolean(),
  linkedDisorderId: canonicalIdSchema.optional(),
});

const disorderSchema = strictObject({
  id: canonicalIdSchema,
  name: z.string().min(1),
  description: narrativeTextSchema.optional(),
  cured: z.boolean(),
});

const adaptationSchema = strictObject({
  id: canonicalIdSchema,
  kind: z.enum(["violence", "helplessness", "other"]),
  label: optionalText,
  incidentMarks: z.number().int().min(0).max(3).optional(),
  adapted: z.boolean().optional(),
});

const itemBase = {
  id: canonicalIdSchema,
  name: z.string().min(1),
  description: narrativeTextSchema.optional(),
};
const expenseSchema = z.string().optional();

const weaponSchema = strictObject({
  ...itemBase,
  skill: z.union([standardSkillIdSchema, z.string().min(1)]),
  skillModifier: z.number().int().optional(),
  range: optionalText,
  damage: optionalText,
  armorPiercing: z.number().int().optional(),
  lethality: z.number().int().optional(),
  killRadius: optionalText,
  ammunition: optionalText,
  expense: expenseSchema,
  equipped: z.boolean(),
});

const armorSchema = strictObject({
  ...itemBase,
  protection: z.number().int(),
  expense: expenseSchema,
  equipped: z.boolean(),
});

const gearSchema = strictObject({
  ...itemBase,
  expense: expenseSchema,
  equipped: z.boolean(),
});

const sanityLossSchema = strictObject({
  success: optionalText,
  failure: optionalText,
  notes: optionalText,
});

const secretKnowledge = {
  handlerNotes: narrativeTextSchema.optional(),
  revealed: z.boolean(),
};

const ritualSchema = strictObject({
  ...itemBase,
  ...secretKnowledge,
  studyTime: optionalText,
  sanityLoss: sanityLossSchema.optional(),
  learnedSanityLoss: sanityLossSchema.optional(),
  unnaturalSkillIncrease: z.number().int().optional(),
  activationCosts: optionalText,
  activationTime: optionalText,
  complexity: optionalText,
});

const tomeSchema = strictObject({
  ...itemBase,
  ...secretKnowledge,
  language: optionalText,
  studyTime: optionalText,
  sanityLoss: sanityLossSchema.optional(),
  unnaturalSkillIncrease: z.number().int().optional(),
  occultSkillIncrease: z.number().int().optional(),
});

const isoDate = z.iso.date();
const isoInstant = z.iso.datetime({ offset: true });
const semver = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);

export const agentSnapshotSchema = strictObject({
  schemaVersion: z.literal(AGENT_SCHEMA_VERSION),
  agentId: canonicalIdSchema,
  identity: strictObject({
    name: optionalText,
    aliases: z.array(z.string().min(1)).optional(),
  }),
  biography: strictObject({
    profession: optionalText,
    employer: optionalText,
    nationality: optionalText,
    sex: optionalText,
    age: z.number().int().nonnegative().optional(),
    dateOfBirth: isoDate.optional(),
    education: optionalText,
    physicalDescription: narrativeTextSchema.optional(),
  }),
  statistics: strictObject({
    strength: statisticSchema.optional(),
    constitution: statisticSchema.optional(),
    dexterity: statisticSchema.optional(),
    intelligence: statisticSchema.optional(),
    power: statisticSchema.optional(),
    charisma: statisticSchema.optional(),
  }),
  resources: strictObject({
    hitPoints: mutableResourceSchema.optional(),
    willpower: mutableResourceSchema.optional(),
    sanity: mutableResourceSchema.optional(),
    breakingPoint: strictObject({
      current: z.number().int(),
      baseline: z.number().int(),
    }).optional(),
    wounds: narrativeTextSchema.optional(),
    exhausted: z.boolean().optional(),
    firstAidAttempted: z.boolean().optional(),
  }),
  skills: strictObject({
    standard: z.partialRecord(standardSkillIdSchema, standardSkillSchema),
    custom: z.array(customSkillSchema),
    specialTraining: z.array(specialTrainingSchema),
  }),
  relationships: strictObject({ bonds: z.array(bondSchema) }),
  psychology: strictObject({
    motivations: z.array(motivationSchema),
    disorders: z.array(disorderSchema),
    adaptations: z.array(adaptationSchema),
    traumaticBackground: optionalText,
  }),
  inventory: strictObject({
    weapons: z.array(weaponSchema),
    armor: z.array(armorSchema),
    gear: z.array(gearSchema),
    rituals: z.array(ritualSchema),
    tomes: z.array(tomeSchema),
  }),
  notes: strictObject({
    player: z.array(narrativeTextSchema),
    handler: z.array(narrativeTextSchema),
  }),
  campaignState: strictObject({
    impossibleLandscapes: strictObject({
      corruption: z.number().int().optional(),
      seenTheYellowSign: z.boolean().optional(),
      gift: optionalText,
      insight: optionalText,
    }).optional(),
  }),
  provenance: strictObject({
    adapter: strictObject({ id: z.string().min(1), version: semver }),
    source: strictObject({
      format: z.string().min(1),
      version: optionalText,
      recordId: optionalText,
    }),
    capturedAt: isoInstant.optional(),
    contentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  }),
  extensions: z.record(
    z.string().regex(/^[a-z][A-Za-z0-9]*$/),
    z.record(z.string(), jsonValueSchema),
  ),
}).meta({
  id: "https://delta-green-character-adapter.dev/schema/agent/1.0.0",
  title: "Canonical Delta Green Agent Snapshot 1.0.0",
  description: "A strict, source-independent point-in-time representation of a playable Delta Green Agent.",
});

export type AgentSnapshot = z.infer<typeof agentSnapshotSchema>;

export function parseAgentSnapshot(input: unknown): AgentSnapshot {
  return agentSnapshotSchema.parse(input);
}

export function safeParseAgentSnapshot(input: unknown) {
  return agentSnapshotSchema.safeParse(input);
}

export function createCanonicalId(): z.infer<typeof canonicalIdSchema> {
  return canonicalIdSchema.parse(globalThis.crypto.randomUUID());
}
