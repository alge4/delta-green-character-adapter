import type { AgentSnapshot, JsonValue } from "@delta-green-character-adapter/character-model";

import {
  BREAKING_POINT_SENTINEL,
  FOUNDRY_STAT_KEYS,
  SAN_SENTINEL_MINIMUM,
  UNARMED_ATTACK_ITEM_NAME,
  UNARMED_COMBAT_GROUP,
  UNARMED_COMBAT_DEFAULT_PROFICIENCY,
} from "./maps.js";
import {
  asJsonValue,
  isRecord,
  normalizeTypedSkillGroup,
  plainTextFrom,
  type UnknownRecord,
} from "./values.js";

export type CanonicalSemanticOptions = {
  /**
   * Relax the projection to the meaning a canonical→Foundry→canonical cycle can carry:
   * narrative formats rewritten as HTML, Unnatural's missing failure box, default
   * Unarmed Combat/Attack the sheet always ships, and unmarked adaptation rows a blank
   * sheet invents. Flag-parked fields (notes, traumatic background, kind=other) round-trip
   * and stay in the projection.
   */
  readonly tolerateFoundryLosses?: boolean;
  /**
   * Restrict the standard-skill comparison to these ids. Export writes the full Delta
   * Green skill table, so a snapshot that only carried a few skills gains the system
   * defaults on the way back.
   */
  readonly restrictStandardSkillsTo?: readonly string[];
};

function stable(value: JsonValue): string {
  return JSON.stringify(value);
}

function sortByKey<T>(entries: readonly T[], key: (entry: T) => string): T[] {
  return [...entries].sort((left, right) => key(left).localeCompare(key(right)));
}

function narrative(
  value: { format: string; content: string } | undefined,
  tolerant: boolean,
): JsonValue {
  if (value === undefined) {
    return null;
  }
  if (tolerant) {
    return plainTextFrom(value.content);
  }
  return { format: value.format, content: value.content };
}

function standardSkillView(
  snapshot: AgentSnapshot,
  options: CanonicalSemanticOptions,
): JsonValue {
  const standard = snapshot.skills.standard as Record<string, JsonValue | undefined>;
  const ids = options.restrictStandardSkillsTo ?? Object.keys(standard);
  const view: Record<string, JsonValue> = {};
  for (const id of [...ids].sort()) {
    const entry = standard[id] ?? null;
    // Delta Green 1.7.0 has no persisted failure box for Unnatural.
    if (options.tolerateFoundryLosses === true && id === "unnatural" && isRecord(entry)) {
      const { failureMarked: _failureMarked, ...rest } = entry;
      view[id] = asJsonValue(rest);
      continue;
    }
    view[id] = asJsonValue(entry);
  }
  return view;
}

/**
 * Meaning-only projection of a canonical snapshot: generated identities, provenance,
 * and adapter extensions are removed so two snapshots of the same Agent compare equal.
 */
export function canonicalSemanticView(
  snapshot: AgentSnapshot,
  options: CanonicalSemanticOptions = {},
): JsonValue {
  const customSkillLabel = new Map(
    snapshot.skills.custom.map((skill) => [skill.id, `${skill.group}/${skill.label}`]),
  );
  const disorderName = new Map(
    snapshot.psychology.disorders.map((disorder) => [disorder.id, disorder.name]),
  );

  const tolerant = options.tolerateFoundryLosses === true;
  // A create-new Delta Green Actor always ships the default Unarmed Combat skill and the
  // Unarmed Attack weapon, so a canonical snapshot that lacked them gains them on the way back.
  const isSystemDefault = (entry: { name?: string; group?: string; proficiency?: number }): boolean =>
    tolerant &&
    ((entry.group === UNARMED_COMBAT_GROUP &&
      entry.proficiency === UNARMED_COMBAT_DEFAULT_PROFICIENCY) ||
      entry.name === UNARMED_ATTACK_ITEM_NAME);
  const view: Record<string, JsonValue> = {
    identity: {
      name: snapshot.identity.name ?? null,
      aliases: [...(snapshot.identity.aliases ?? [])],
    },
    biography: {
      profession: snapshot.biography.profession ?? null,
      employer: snapshot.biography.employer ?? null,
      nationality: snapshot.biography.nationality ?? null,
      sex: snapshot.biography.sex ?? null,
      age: snapshot.biography.age ?? null,
      dateOfBirth: snapshot.biography.dateOfBirth ?? null,
      education: snapshot.biography.education ?? null,
      physicalDescription: narrative(snapshot.biography.physicalDescription, tolerant),
    },
    statistics: asJsonValue(snapshot.statistics),
    resources: {
      hitPoints: asJsonValue(snapshot.resources.hitPoints ?? null),
      willpower: asJsonValue(snapshot.resources.willpower ?? null),
      sanity: asJsonValue(snapshot.resources.sanity ?? null),
      breakingPoint: asJsonValue(snapshot.resources.breakingPoint ?? null),
      wounds: narrative(snapshot.resources.wounds, tolerant),
      exhausted: snapshot.resources.exhausted ?? false,
      firstAidAttempted: snapshot.resources.firstAidAttempted ?? false,
    },
    skills: {
      standard: standardSkillView(snapshot, options),
      custom: sortByKey(
        snapshot.skills.custom.filter((skill) => !isSystemDefault(skill)),
        (skill) => `${skill.group}/${skill.label}`,
      ).map((skill) => ({
          group: skill.group,
          label: skill.label,
          proficiency: skill.proficiency,
          failureMarked: skill.failureMarked,
        }),
      ),
      specialTraining: sortByKey(snapshot.skills.specialTraining, (entry) => entry.name).map(
        (entry) => ({
          name: entry.name,
          uses:
            entry.uses.kind === "customSkill"
              ? { kind: "customSkill", skill: customSkillLabel.get(entry.uses.skillId) ?? null }
              : asJsonValue(entry.uses),
        }),
      ),
    },
    bonds: sortByKey(snapshot.relationships.bonds, (bond) => bond.name).map((bond) => ({
      name: bond.name,
      relationship: bond.relationship ?? null,
      description: narrative(bond.description, tolerant),
      score: bond.score,
      damagedSinceLastHomeScene: bond.damagedSinceLastHomeScene,
    })),
    psychology: {
      motivations: sortByKey(
        snapshot.psychology.motivations.filter((entry) => {
          if (!tolerant || entry.linkedDisorderId === undefined) {
            return true;
          }
          // Foundry carries a disorder on a motivation Item, so an unlinked canonical
          // disorder comes back as the placeholder motivation export had to synthesize.
          return entry.statement !== `Disorder: ${disorderName.get(entry.linkedDisorderId) ?? ""}`;
        }),
        (entry) => entry.statement,
      ).map((entry) => ({
          statement: entry.statement,
          crossedOut: entry.crossedOut,
          linkedDisorder:
            entry.linkedDisorderId === undefined
              ? null
              : disorderName.get(entry.linkedDisorderId) ?? null,
        }),
      ),
      disorders: sortByKey(snapshot.psychology.disorders, (entry) => entry.name).map((entry) => ({
        name: entry.name,
        cured: entry.cured,
      })),
      adaptations: sortByKey(
        snapshot.psychology.adaptations.filter((entry) => {
          if (!tolerant) {
            return true;
          }
          // Unmarked violence/helplessness rows are what a blank sheet means; drop them so a
          // sparse canonical fixture that omitted them still round-trips. kind=other is parked
          // in adapter flags and is restored on import, so it stays in the projection.
          if (entry.kind === "violence" || entry.kind === "helplessness") {
            return entry.adapted === true || (entry.incidentMarks ?? 0) > 0;
          }
          return true;
        }),
        (entry) => `${entry.kind}/${entry.label ?? ""}`,
      ).map((entry) => {
        const adapted = entry.adapted ?? entry.incidentMarks === 3;
        return {
          kind: entry.kind,
          label: entry.label ?? null,
          // Export may synthesize three incident bits from adapted:true alone (#18 known loss).
          // Keep exact marks when they are the only signal; collapse them once adapted is true.
          incidentMarks: tolerant && adapted === true ? null : entry.incidentMarks ?? null,
          adapted,
        };
      }),
      traumaticBackground: snapshot.psychology.traumaticBackground ?? null,
    },
    inventory: {
      weapons: sortByKey(
        snapshot.inventory.weapons.filter((entry) => !isSystemDefault(entry)),
        (entry) => entry.name,
      ).map((entry) => {
        const { id: _id, ...rest } = entry;
        return asJsonValue(rest);
      }),
      armor: sortByKey(snapshot.inventory.armor, (entry) => entry.name).map((entry) => {
        const { id: _id, ...rest } = entry;
        return asJsonValue(rest);
      }),
      gear: sortByKey(snapshot.inventory.gear, (entry) => entry.name).map((entry) => {
        const { id: _id, ...rest } = entry;
        return asJsonValue(rest);
      }),
      tomes: sortByKey(snapshot.inventory.tomes, (entry) => entry.name).map((entry) => {
        const { id: _id, ...rest } = entry;
        return asJsonValue(rest);
      }),
      rituals: sortByKey(snapshot.inventory.rituals, (entry) => entry.name).map((entry) => {
        const { id: _id, ...rest } = entry;
        return asJsonValue(rest);
      }),
    },
    notes: {
      player: asJsonValue(snapshot.notes.player),
      handler: asJsonValue(snapshot.notes.handler),
    },
    campaignState: asJsonValue(snapshot.campaignState),
  };
  return view;
}

const IGNORED_DOCUMENT_KEYS = new Set([
  "_id",
  "_stats",
  "folder",
  "ownership",
  "prototypeToken",
  "sort",
  "img",
  "effects",
]);

function stripDocument(record: UnknownRecord): UnknownRecord {
  const out: UnknownRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (IGNORED_DOCUMENT_KEYS.has(key)) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Meaning-only projection of a Foundry Actor source object: Foundry-owned document
 * metadata, prepared projections, sheet labels, local collection keys, and adapter flags
 * are removed, and the SAN/BP initialization sentinels are normalized the way the system
 * prepare pass would resolve them.
 */
export function foundrySemanticView(actor: unknown): JsonValue {
  if (!isRecord(actor)) {
    return null;
  }
  const stripped = stripDocument(actor);
  const system = isRecord(stripped.system) ? stripped.system : {};

  const statistics = isRecord(system.statistics) ? system.statistics : {};
  const power = Number(
    (isRecord(statistics.pow) ? statistics.pow.value : undefined) ?? 10,
  );
  const sanity = isRecord(system.sanity) ? system.sanity : {};
  const rawSanity = typeof sanity.value === "number" ? sanity.value : SAN_SENTINEL_MINIMUM;
  const sanityValue = rawSanity >= SAN_SENTINEL_MINIMUM ? power * 5 : rawSanity;
  const rawBreakingPoint =
    typeof sanity.currentBreakingPoint === "number"
      ? sanity.currentBreakingPoint
      : BREAKING_POINT_SENTINEL;
  const breakingPoint =
    rawBreakingPoint === BREAKING_POINT_SENTINEL && rawSanity >= SAN_SENTINEL_MINIMUM
      ? sanityValue - power
      : rawBreakingPoint;

  const skills = isRecord(system.skills) ? system.skills : {};
  const normalizedSkills: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(skills)) {
    if (!isRecord(value)) {
      continue;
    }
    normalizedSkills[key] = {
      proficiency: typeof value.proficiency === "number" ? value.proficiency : 0,
      failure: value.failure === true,
    };
  }

  const typedSkills = isRecord(system.typedSkills) ? system.typedSkills : {};
  const normalizedTypedSkills = Object.values(typedSkills)
    .filter(isRecord)
    .map((value) => ({
      label: typeof value.label === "string" ? value.label : "",
      group: typeof value.group === "string" ? normalizeTypedSkillGroup(value.group) : "",
      proficiency: typeof value.proficiency === "number" ? value.proficiency : 0,
      failure: value.failure === true,
    }))
    .sort((left, right) =>
      `${left.group}/${left.label}`.localeCompare(`${right.group}/${right.label}`),
    );

  const specialTraining = Array.isArray(system.specialTraining) ? system.specialTraining : [];
  const normalizedSpecialTraining = specialTraining
    .filter(isRecord)
    .map((value) => ({
      name: typeof value.name === "string" ? value.name : "",
      attribute: typeof value.attribute === "string" ? value.attribute : "",
    }))
    .sort((left, right) => `${left.name}/${left.attribute}`.localeCompare(`${right.name}/${right.attribute}`));

  const items = Array.isArray(stripped.items) ? stripped.items : [];
  const normalizedItems = items
    .filter(isRecord)
    .map((item) => {
      const itemSystem = isRecord(item.system) ? { ...item.system } : {};
      // Extension-only weapon field: the canonical model has no home for it.
      delete itemSystem.customSkillTarget;
      return {
        name: typeof item.name === "string" ? item.name : "",
        type: typeof item.type === "string" ? item.type : "",
        system: asJsonValue(itemSystem),
      };
    })
    .sort((left, right) => stable(asJsonValue(left)).localeCompare(stable(asJsonValue(right))));

  const statisticsView: Record<string, JsonValue> = {};
  for (const key of FOUNDRY_STAT_KEYS) {
    const entry = isRecord(statistics[key]) ? (statistics[key] as UnknownRecord) : {};
    statisticsView[key] = {
      value: typeof entry.value === "number" ? entry.value : 0,
      distinguishing_feature:
        typeof entry.distinguishing_feature === "string" ? entry.distinguishing_feature : "",
    };
  }

  const health = isRecord(system.health) ? system.health : {};
  const willpower = isRecord(system.wp) ? system.wp : {};
  const physical = isRecord(system.physical) ? system.physical : {};
  const biography = isRecord(system.biography) ? system.biography : {};
  const corruption = isRecord(system.corruption) ? system.corruption : {};

  return {
    name: typeof stripped.name === "string" ? stripped.name : "",
    type: typeof stripped.type === "string" ? stripped.type : "",
    system: {
      health: {
        value: typeof health.value === "number" ? health.value : 0,
        max: typeof health.max === "number" ? health.max : 0,
      },
      wp: {
        value: typeof willpower.value === "number" ? willpower.value : 0,
        max: typeof willpower.max === "number" ? willpower.max : 0,
      },
      statistics: statisticsView,
      skills: normalizedSkills,
      typedSkills: normalizedTypedSkills,
      specialTraining: normalizedSpecialTraining,
      sanity: {
        value: sanityValue,
        currentBreakingPoint: breakingPoint,
        adaptations: (() => {
          const adaptations = isRecord(sanity.adaptations) ? sanity.adaptations : {};
          const view: Record<string, JsonValue> = {};
          for (const [kind, entry] of Object.entries(adaptations)) {
            if (!isRecord(entry)) {
              continue;
            }
            // Prepared `isAdapted` must never enter semantic equality.
            view[kind] = {
              incident1: entry.incident1 === true,
              incident2: entry.incident2 === true,
              incident3: entry.incident3 === true,
            };
          }
          return view;
        })(),
      },
      physical: {
        description: typeof physical.description === "string" ? physical.description : "",
        wounds: typeof physical.wounds === "string" ? physical.wounds : "",
        firstAidAttempted: physical.firstAidAttempted === true,
        exhausted: physical.exhausted === true,
      },
      biography: asJsonValue(biography),
      corruption: asJsonValue(corruption),
    },
    items: normalizedItems,
  };
}
