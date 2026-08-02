import {
  createOperationResult,
  type AdapterDiagnostic,
  type AdapterOperationResult,
} from "@delta-green-character-adapter/adapter-core";
import {
  createCanonicalId,
  safeParseAgentSnapshot,
  type AgentSnapshot,
  type JsonValue,
  type StandardSkillId,
} from "@delta-green-character-adapter/character-model";

import {
  catalogueDiagnosticCodes,
  fatalStructure,
  information,
  knownLoss,
  warning,
} from "./diagnostic-helpers.js";
import {
  ADAPTATION_KINDS,
  ADAPTER_FLAG_NAMESPACE,
  CANONICAL_STAT_IDS,
  DEFAULT_EXHAUSTED_PENALTY,
  DEFAULT_SCHEMA_VERSION,
  DEFAULT_SHEET_SETTINGS,
  EXPORT_ADAPTER_ID,
  EXPORT_CAPABILITY_ID,
  REVERSE_SKILL_KEY_MAP,
  REVERSE_STAT_KEY_MAP,
  SKILL_KEY_MAP,
  SAN_SENTINEL_MINIMUM,
  SKILL_KEYS_WITHOUT_FAILURE,
  STANDARD_SKILL_DEFAULTS,
  SYSTEM_FLAG_NAMESPACE,
  TYPED_SKILL_FAMILY_LABELS,
  TYPED_SKILL_FAMILY_SET,
  UNARMED_ATTACK_ITEM_NAME,
  UNARMED_ATTACK_SYSTEM_DEFAULTS,
  UNARMED_ATTACK_SYSTEM_NAME,
  UNARMED_COMBAT_GROUP,
  UNARMED_COMBAT_LABEL,
  UNARMED_COMBAT_SKILL_KEY,
  type TypedSkillFamily,
} from "./maps.js";
import { asJsonValue, isRecord, pointer, textToHtml, type UnknownRecord } from "./values.js";

export type ExportFoundryDeltaGreenOptions = {
  readonly createId?: () => string;
  readonly adapterVersion?: string;
};

type NarrativeText = { readonly format: "plain" | "markdown" | "html"; readonly content: string };
type JsonRecord = Record<string, JsonValue>;

/** Foundry document ids are 16 alphanumeric characters; derive one from a canonical UUID. */
function foundryLocalId(canonicalId: string): string {
  return canonicalId.replace(/-/g, "").slice(0, 16);
}

export function exportFoundryDeltaGreen(
  snapshot: AgentSnapshot | unknown,
  options: ExportFoundryDeltaGreenOptions = {},
): AdapterOperationResult {
  const createId = options.createId ?? createCanonicalId;
  const adapterVersion = options.adapterVersion ?? "0.0.0";
  const diagnostics: AdapterDiagnostic[] = [];

  const parsed = safeParseAgentSnapshot(snapshot);
  if (!parsed.success) {
    return createOperationResult({
      diagnostics: [
        fatalStructure(
          `Input does not parse as canonical Agent 1.0.0: ${parsed.error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
            .join("; ")}`,
          "",
        ),
      ],
      requiredResolutions: [],
    });
  }
  const agent = parsed.data;

  const foundryExtension = isRecord(agent.extensions.foundry)
    ? (agent.extensions.foundry as UnknownRecord)
    : undefined;
  const sheetExtension = isRecord(foundryExtension?.sheet)
    ? (foundryExtension?.sheet as UnknownRecord)
    : undefined;
  const identityExtension = isRecord(foundryExtension?.identity)
    ? (foundryExtension?.identity as UnknownRecord)
    : undefined;
  const typedSkillBindings = isRecord(identityExtension?.typedSkills)
    ? (identityExtension?.typedSkills as UnknownRecord)
    : undefined;
  const specialTrainingBindings = isRecord(identityExtension?.specialTraining)
    ? (identityExtension?.specialTraining as UnknownRecord)
    : undefined;
  const systemOwnedItems = isRecord(identityExtension?.systemOwnedItems)
    ? (identityExtension?.systemOwnedItems as UnknownRecord)
    : undefined;

  const foreignExtensions = Object.keys(agent.extensions).filter((key) => key !== "foundry");
  if (foreignExtensions.length > 0) {
    diagnostics.push(
      knownLoss(
        "information",
        "foreign-extensions-not-exported",
        `Non-Foundry extensions (${foreignExtensions.join(", ")}) are not written into Delta Green system fields.`,
        { canonicalPath: "/extensions" },
      ),
    );
  }

  function toHtml(
    text: NarrativeText | undefined,
    canonicalPath: string,
    targetPath: string,
  ): string {
    if (text === undefined || text.content.length === 0) {
      return "";
    }
    if (text.format === "html") {
      return text.content;
    }
    diagnostics.push(
      knownLoss(
        "information",
        "narrative-format-conversion",
        `Canonical ${text.format} narrative was converted to sanitized HTML for the Delta Green field.`,
        { canonicalPath, targetPath },
      ),
    );
    return textToHtml(text.content);
  }

  // --- statistics and formula maxima ---
  const statistics: JsonRecord = {};
  const statScore = (id: (typeof CANONICAL_STAT_IDS)[number]): number =>
    agent.statistics[id]?.score ?? 10;
  for (const id of CANONICAL_STAT_IDS) {
    const entry = agent.statistics[id];
    const score = statScore(id);
    if (score < 3 || score > 18) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Statistic ${id}=${score} is outside the usual 3–18 range and was written without clamping.`,
          pointer("statistics", id, "score"),
          { targetPath: pointer("system", "statistics", REVERSE_STAT_KEY_MAP[id], "value") },
        ),
      );
    }
    statistics[REVERSE_STAT_KEY_MAP[id]] = {
      value: score,
      distinguishing_feature: entry?.distinguishingFeature ?? "",
    };
  }

  const power = statScore("power");
  const healthMaximum = Math.ceil((statScore("strength") + statScore("constitution")) / 2);
  const willpowerMaximum = power;
  const sanityMaximum = power * 5;

  function resourceValue(
    resource: { current: number; maximum: number } | undefined,
    formulaMaximum: number,
    canonicalPath: string,
    targetPath: string,
  ): number {
    if (resource === undefined) {
      return formulaMaximum;
    }
    if (resource.maximum !== formulaMaximum) {
      diagnostics.push(
        knownLoss(
          "warning",
          "maxima-follow-formula",
          `Canonical maximum ${resource.maximum} disagrees with the Delta Green formula value ${formulaMaximum}; the formula value was written because prepare recomputes it.`,
          { canonicalPath, targetPath },
        ),
      );
    }
    return resource.current;
  }

  const healthValue = resourceValue(
    agent.resources.hitPoints,
    healthMaximum,
    "/resources/hitPoints/maximum",
    "/system/health/max",
  );
  const willpowerValue = resourceValue(
    agent.resources.willpower,
    willpowerMaximum,
    "/resources/willpower/maximum",
    "/system/wp/max",
  );

  let sanityValue = agent.resources.sanity?.current ?? sanityMaximum;
  if (sanityValue >= SAN_SENTINEL_MINIMUM) {
    diagnostics.push(
      knownLoss(
        "warning",
        "san-cannot-persist-ge-100",
        `Canonical sanity ${sanityValue} cannot survive Foundry prepare, which treats values at or above ${SAN_SENTINEL_MINIMUM} as an initialization sentinel; POW×5 (${sanityMaximum}) was written instead.`,
        { canonicalPath: "/resources/sanity/current", targetPath: "/system/sanity/value" },
      ),
    );
    sanityValue = sanityMaximum;
  }

  const breakingPointCurrent = agent.resources.breakingPoint?.current ?? sanityValue - power;
  const breakingPointBaseline = agent.resources.breakingPoint?.baseline ?? breakingPointCurrent;

  // --- adaptations ---
  const adaptationsOut: JsonRecord = {};
  for (const kind of ADAPTATION_KINDS) {
    const entry = agent.psychology.adaptations.find((adaptation) => adaptation.kind === kind);
    let marks = 0;
    if (entry?.incidentMarks !== undefined) {
      marks = entry.incidentMarks;
    } else if (entry?.adapted === true) {
      marks = 3;
      diagnostics.push(
        knownLoss(
          "information",
          "adaptation-marks-synthesized-from-adapted-flag",
          `Adaptation ${kind} is adapted without explicit incidentMarks; all three incidents were written.`,
          { canonicalPath: "/psychology/adaptations", targetPath: `/system/sanity/adaptations/${kind}` },
        ),
      );
    }
    adaptationsOut[kind] = {
      incident1: marks >= 1,
      incident2: marks >= 2,
      incident3: marks >= 3,
    };
  }

  const otherAdaptations = agent.psychology.adaptations.filter(
    (adaptation) => adaptation.kind === "other",
  );
  if (otherAdaptations.length > 0) {
    diagnostics.push(
      knownLoss(
        "warning",
        "other-adaptations-not-in-system",
        "Foundry only models violence and helplessness incident bits; kind=other adaptations were parked in adapter flags.",
        {
          canonicalPath: "/psychology/adaptations",
          targetPath: "/flags/deltaGreenCharacterAdapter/unrepresentable/otherAdaptations",
        },
      ),
    );
  }

  // --- skills ---
  const unarmedCustom = agent.skills.custom.find(
    (skill) => skill.group === UNARMED_COMBAT_GROUP,
  );
  const skillsOut: JsonRecord = {};
  for (const [key, label, defaultProficiency] of STANDARD_SKILL_DEFAULTS) {
    let proficiency = defaultProficiency;
    let failureMarked = false;
    if (key === UNARMED_COMBAT_SKILL_KEY) {
      if (unarmedCustom !== undefined) {
        proficiency = unarmedCustom.proficiency;
        failureMarked = unarmedCustom.failureMarked;
      }
    } else {
      const standardId = SKILL_KEY_MAP[key];
      const entry = standardId === undefined ? undefined : agent.skills.standard[standardId];
      if (entry !== undefined) {
        proficiency = entry.proficiency;
        failureMarked = entry.failureMarked;
      }
    }
    skillsOut[key] = {
      proficiency,
      label,
      ...(SKILL_KEYS_WITHOUT_FAILURE.has(key) ? {} : { failure: failureMarked }),
    };
  }

  const typedSkillsOut: JsonRecord = {};
  const typedSkillKeyByCanonicalId = new Map<string, string>();
  const usedTypedKeys = new Set<string>();
  for (const skill of agent.skills.custom) {
    if (skill.group === UNARMED_COMBAT_GROUP) {
      continue;
    }
    const bound = typedSkillBindings?.[skill.id];
    if (typeof bound === "string" && bound.length > 0 && !usedTypedKeys.has(bound)) {
      usedTypedKeys.add(bound);
      typedSkillKeyByCanonicalId.set(skill.id, bound);
    }
  }
  let typedKeyCounter = 0;
  for (const skill of agent.skills.custom) {
    if (skill.group === UNARMED_COMBAT_GROUP) {
      continue;
    }
    let key = typedSkillKeyByCanonicalId.get(skill.id);
    while (key === undefined) {
      typedKeyCounter += 1;
      const candidate = `tskill_${String(typedKeyCounter).padStart(2, "0")}`;
      if (!usedTypedKeys.has(candidate)) {
        usedTypedKeys.add(candidate);
        typedSkillKeyByCanonicalId.set(skill.id, candidate);
        key = candidate;
      }
    }
    let group: string;
    if (TYPED_SKILL_FAMILY_SET.has(skill.group)) {
      group = TYPED_SKILL_FAMILY_LABELS[skill.group as TypedSkillFamily];
    } else {
      group = skill.group;
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Custom skill group ${skill.group} is not a Delta Green handbook family; it was written verbatim as a typed skill group.`,
          pointer("skills", "custom"),
          { targetPath: pointer("system", "typedSkills", key, "group") },
        ),
      );
    }
    typedSkillsOut[key] = {
      label: skill.label,
      group,
      proficiency: skill.proficiency,
      failure: skill.failureMarked,
    };
  }

  const specialTrainingOut: JsonValue[] = [];
  const specialTrainingIdByCanonicalId = new Map<string, string>();
  for (const entry of agent.skills.specialTraining) {
    let attribute: string | undefined;
    if (entry.uses.kind === "statistic") {
      attribute = REVERSE_STAT_KEY_MAP[entry.uses.statistic];
    } else if (entry.uses.kind === "standardSkill") {
      attribute = REVERSE_SKILL_KEY_MAP[entry.uses.skill];
    } else if (unarmedCustom !== undefined && entry.uses.skillId === unarmedCustom.id) {
      attribute = UNARMED_COMBAT_SKILL_KEY;
    } else {
      attribute = typedSkillKeyByCanonicalId.get(entry.uses.skillId);
    }
    if (attribute === undefined) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.derivedConflict,
          `Special training ${entry.name} references a custom skill that is not exported; the entry was skipped.`,
          pointer("skills", "specialTraining"),
          { targetPath: "/system/specialTraining" },
        ),
      );
      continue;
    }
    const bound = specialTrainingBindings?.[entry.id];
    const localId =
      typeof bound === "string" && bound.length > 0 ? bound : foundryLocalId(createId());
    specialTrainingIdByCanonicalId.set(entry.id, localId);
    specialTrainingOut.push({ name: entry.name, attribute, id: localId });
  }

  // --- embedded items ---
  const items: JsonValue[] = [];
  let unarmedAttackBound = false;

  function isSystemUnarmedAttack(weaponId: string, name: string): boolean {
    const flagged = systemOwnedItems?.[weaponId];
    if (isRecord(flagged) && flagged.SystemName === UNARMED_ATTACK_SYSTEM_NAME) {
      return true;
    }
    return name === UNARMED_ATTACK_ITEM_NAME;
  }

  function weaponSkillKey(skill: string): string {
    const reverse = REVERSE_SKILL_KEY_MAP[skill as StandardSkillId];
    return reverse ?? skill;
  }

  for (const weapon of agent.inventory.weapons) {
    const isUnarmed = !unarmedAttackBound && isSystemUnarmedAttack(weapon.id, weapon.name);
    const weaponSystem: JsonRecord = {
      description: toHtml(
        weapon.description,
        "/inventory/weapons",
        "/items/system/description",
      ),
      skill: weaponSkillKey(weapon.skill),
      skillModifier: weapon.skillModifier ?? 0,
      range: weapon.range ?? "",
      damage: weapon.damage ?? "",
      armorPiercing: weapon.armorPiercing ?? 0,
      lethality: weapon.lethality ?? 0,
      isLethal: (weapon.lethality ?? 0) > 0,
      killRadius: weapon.killRadius ?? "",
      ammo: weapon.ammunition ?? "",
      expense: weapon.expense ?? "Standard",
      equipped: weapon.equipped,
    };
    if (isUnarmed) {
      unarmedAttackBound = true;
      items.push({
        name: weapon.name,
        type: "weapon",
        system: weaponSystem,
        flags: {
          [SYSTEM_FLAG_NAMESPACE]: {
            AutoAdded: true,
            SystemName: UNARMED_ATTACK_SYSTEM_NAME,
          },
        },
      });
      continue;
    }
    items.push({ name: weapon.name, type: "weapon", system: weaponSystem });
  }

  if (!unarmedAttackBound) {
    items.unshift({
      name: UNARMED_ATTACK_ITEM_NAME,
      type: "weapon",
      system: { ...UNARMED_ATTACK_SYSTEM_DEFAULTS },
      flags: {
        [SYSTEM_FLAG_NAMESPACE]: {
          AutoAdded: true,
          SystemName: UNARMED_ATTACK_SYSTEM_NAME,
        },
      },
    });
    diagnostics.push(
      information(
        catalogueDiagnosticCodes.safeDefault,
        "No canonical weapon matched the system-owned Unarmed Attack; the Delta Green default weapon was written once so create does not duplicate it.",
        "/inventory/weapons",
        { targetPath: "/items" },
      ),
    );
  }

  for (const entry of agent.inventory.armor) {
    items.push({
      name: entry.name,
      type: "armor",
      system: {
        description: toHtml(entry.description, "/inventory/armor", "/items/system/description"),
        protection: entry.protection,
        equipped: entry.equipped,
        expense: entry.expense ?? "Standard",
      },
    });
  }

  for (const entry of agent.inventory.gear) {
    items.push({
      name: entry.name,
      type: "gear",
      system: {
        description: toHtml(entry.description, "/inventory/gear", "/items/system/description"),
        equipped: entry.equipped,
        expense: entry.expense ?? "Standard",
      },
    });
  }

  for (const entry of agent.inventory.tomes) {
    items.push({
      name: entry.name,
      type: "tome",
      system: {
        description: toHtml(entry.description, "/inventory/tomes", "/items/system/description"),
        language: entry.language ?? "",
        studyTime: entry.studyTime ?? "",
        unnaturalSkillIncrease: entry.unnaturalSkillIncrease ?? 0,
        occultSkillIncrease: entry.occultSkillIncrease ?? 0,
        sanity: {
          notes: entry.sanityLoss?.notes ?? "",
          failedLoss: entry.sanityLoss?.failure ?? "",
          successLoss: entry.sanityLoss?.success ?? "",
        },
        handlerNotes: toHtml(
          entry.handlerNotes,
          "/inventory/tomes",
          "/items/system/handlerNotes",
        ),
        revealed: entry.revealed,
      },
    });
  }

  for (const entry of agent.inventory.rituals) {
    items.push({
      name: entry.name,
      type: "ritual",
      system: {
        description: toHtml(entry.description, "/inventory/rituals", "/items/system/description"),
        studyTime: entry.studyTime ?? "",
        sanity: {
          notes: entry.sanityLoss?.notes ?? "",
          failedLoss: entry.sanityLoss?.failure ?? "",
          successLoss: entry.sanityLoss?.success ?? "",
        },
        learnedSanity: {
          notes: entry.learnedSanityLoss?.notes ?? "",
          failedLoss: entry.learnedSanityLoss?.failure ?? "",
          successLoss: entry.learnedSanityLoss?.success ?? "",
        },
        unnaturalSkillIncrease: entry.unnaturalSkillIncrease ?? 0,
        activationCosts: entry.activationCosts ?? "",
        activationTime: entry.activationTime ?? "",
        complexity: entry.complexity ?? "",
        handlerNotes: toHtml(
          entry.handlerNotes,
          "/inventory/rituals",
          "/items/system/handlerNotes",
        ),
        revealed: entry.revealed,
      },
    });
  }

  for (const bond of agent.relationships.bonds) {
    items.push({
      name: bond.name,
      type: "bond",
      system: {
        description: toHtml(bond.description, "/relationships/bonds", "/items/system/description"),
        score: bond.score,
        relationship: bond.relationship ?? "",
        hasBeenDamagedSinceLastHomeScene: bond.damagedSinceLastHomeScene,
      },
    });
  }

  const linkedDisorderIds = new Set(
    agent.psychology.motivations
      .map((motivation) => motivation.linkedDisorderId)
      .filter((id): id is string => id !== undefined),
  );
  const disorderById = new Map(agent.psychology.disorders.map((disorder) => [disorder.id, disorder]));

  for (const motivation of agent.psychology.motivations) {
    const disorder =
      motivation.linkedDisorderId === undefined
        ? undefined
        : disorderById.get(motivation.linkedDisorderId);
    items.push({
      name: motivation.statement,
      type: "motivation",
      system: {
        description: "",
        disorder: disorder?.name ?? "",
        crossedOut: motivation.crossedOut,
        disorderCured: disorder?.cured ?? false,
      },
    });
  }

  for (const disorder of agent.psychology.disorders) {
    if (linkedDisorderIds.has(disorder.id)) {
      continue;
    }
    diagnostics.push(
      knownLoss(
        "information",
        "unlinked-disorder-normalization",
        `Disorder ${disorder.name} is not linked to a motivation; Foundry stores disorders on motivation Items, so a motivation Item was synthesized.`,
        { canonicalPath: "/psychology/disorders", targetPath: "/items" },
      ),
    );
    items.push({
      name: `Disorder: ${disorder.name}`,
      type: "motivation",
      system: {
        description: toHtml(
          disorder.description,
          "/psychology/disorders",
          "/items/system/description",
        ),
        disorder: disorder.name,
        crossedOut: false,
        disorderCured: disorder.cured,
      },
    });
  }

  // --- adapter flags ---
  const unrepresentable: JsonRecord = { breakingPointBaseline };
  if (agent.biography.dateOfBirth !== undefined) {
    unrepresentable.dateOfBirth = agent.biography.dateOfBirth;
  }
  if (agent.identity.aliases !== undefined && agent.identity.aliases.length > 0) {
    unrepresentable.aliases = [...agent.identity.aliases];
  }
  if (agent.notes.player.length > 0 || agent.notes.handler.length > 0) {
    unrepresentable.notes = {
      player: agent.notes.player.map((note) => ({ ...note })),
      handler: agent.notes.handler.map((note) => ({ ...note })),
    };
  }
  if (agent.psychology.traumaticBackground !== undefined) {
    unrepresentable.traumaticBackground = agent.psychology.traumaticBackground;
  }
  if (otherAdaptations.length > 0) {
    unrepresentable.otherAdaptations = otherAdaptations.map((adaptation) => ({
      ...(adaptation.label !== undefined ? { label: adaptation.label } : {}),
      ...(adaptation.incidentMarks !== undefined ? { incidentMarks: adaptation.incidentMarks } : {}),
      ...(adaptation.adapted !== undefined ? { adapted: adaptation.adapted } : {}),
    }));
  }
  diagnostics.push(
    knownLoss(
      "information",
      "dob-aliases-notes-in-flags-only",
      "Date of birth, aliases, notes, traumatic background, and the breaking point baseline have no Delta Green Agent fields and were written to adapter flags only.",
      { canonicalPath: "/biography/dateOfBirth", targetPath: "/flags/deltaGreenCharacterAdapter/unrepresentable" },
    ),
  );

  const bindings: JsonRecord = {};
  if (typedSkillKeyByCanonicalId.size > 0) {
    bindings.typedSkills = Object.fromEntries(typedSkillKeyByCanonicalId);
  }
  if (specialTrainingIdByCanonicalId.size > 0) {
    bindings.specialTraining = Object.fromEntries(specialTrainingIdByCanonicalId);
  }

  const adapterFlags: JsonRecord = {
    agentId: agent.agentId,
    unrepresentable,
    audit: {
      capabilityId: EXPORT_CAPABILITY_ID,
      adapterId: EXPORT_ADAPTER_ID,
      adapterVersion,
      sourceFormat: agent.provenance.source.format,
      sourceContentHash: agent.provenance.contentHash,
    },
    ...(Object.keys(bindings).length > 0 ? { bindings } : {}),
  };

  // --- sheet restore ---
  const settings =
    sheetExtension !== undefined && isRecord(sheetExtension.settings)
      ? (asJsonValue(sheetExtension.settings) as JsonRecord)
      : (asJsonValue(DEFAULT_SHEET_SETTINGS) as JsonRecord);
  const schemaVersion =
    typeof sheetExtension?.schemaVersion === "number"
      ? sheetExtension.schemaVersion
      : DEFAULT_SCHEMA_VERSION;
  const exhaustedPenalty =
    typeof sheetExtension?.exhaustedPenalty === "number"
      ? sheetExtension.exhaustedPenalty
      : DEFAULT_EXHAUSTED_PENALTY;
  const healthMin = typeof sheetExtension?.healthMin === "number" ? sheetExtension.healthMin : 0;
  const wpMin = typeof sheetExtension?.wpMin === "number" ? sheetExtension.wpMin : 0;

  const impossibleLandscapes = agent.campaignState.impossibleLandscapes;

  const actor: JsonRecord = {
    name: agent.identity.name ?? "Unnamed Agent",
    type: "agent",
    system: {
      health: { min: healthMin, value: healthValue, max: healthMaximum },
      wp: { min: wpMin, value: willpowerValue, max: willpowerMaximum },
      statistics,
      settings,
      skills: skillsOut,
      typedSkills: typedSkillsOut,
      specialTraining: specialTrainingOut,
      schemaVersion,
      sanity: {
        value: sanityValue,
        currentBreakingPoint: breakingPointCurrent,
        adaptations: adaptationsOut,
      },
      physical: {
        description: toHtml(
          agent.biography.physicalDescription,
          "/biography/physicalDescription",
          "/system/physical/description",
        ),
        wounds: agent.resources.wounds?.content ?? "",
        firstAidAttempted: agent.resources.firstAidAttempted ?? false,
        exhausted: agent.resources.exhausted ?? false,
        exhaustedPenalty,
      },
      biography: {
        profession: agent.biography.profession ?? "",
        employer: agent.biography.employer ?? "",
        nationality: agent.biography.nationality ?? "",
        sex: agent.biography.sex ?? "",
        age: agent.biography.age === undefined ? "" : String(agent.biography.age),
        education: agent.biography.education ?? "",
      },
      corruption: {
        value: impossibleLandscapes?.corruption ?? 0,
        haveSeenTheYellowSign: impossibleLandscapes?.seenTheYellowSign ?? false,
        gift: impossibleLandscapes?.gift ?? "",
        insight: impossibleLandscapes?.insight ?? "",
      },
    },
    items,
    flags: { [ADAPTER_FLAG_NAMESPACE]: adapterFlags },
  };

  if (agent.identity.name === undefined) {
    diagnostics.push(
      warning(
        catalogueDiagnosticCodes.missingRecommended,
        "Canonical identity.name is absent; a placeholder Actor name was written.",
        "/identity/name",
        { targetPath: "/name" },
      ),
    );
  }

  if (unarmedCustom === undefined) {
    diagnostics.push(
      information(
        catalogueDiagnosticCodes.safeDefault,
        `No canonical custom skill with group ${UNARMED_COMBAT_GROUP}; the Delta Green ${UNARMED_COMBAT_LABEL} default rating was written.`,
        "/skills/custom",
        { targetPath: "/system/skills/unarmed_combat" },
      ),
    );
  }

  return createOperationResult({ diagnostics, requiredResolutions: [], output: actor });
}
