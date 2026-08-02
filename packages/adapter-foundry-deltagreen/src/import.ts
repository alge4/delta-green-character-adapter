import {
  createOperationResult,
  createUnsupportedVersionDiagnostic,
  type AdapterDiagnostic,
  type AdapterOperationResult,
} from "@delta-green-character-adapter/adapter-core";
import {
  createCanonicalId,
  parseAgentSnapshot,
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
  ADAPTATION_ENTRY_KEYS,
  ADAPTATION_KINDS,
  ACTOR_ROOT_KEYS,
  ADAPTER_FLAG_NAMESPACE,
  BIOGRAPHY_KEYS,
  BREAKING_POINT_SENTINEL,
  CORE_VERSION,
  CORRUPTION_KEYS,
  FOUNDRY_FORMAT,
  FOUNDRY_STAT_KEYS,
  FOUNDRY_VERSION,
  IMPORT_ADAPTER_ID,
  ITEM_SYSTEM_FIELDS,
  MAPPED_ITEM_TYPE_SET,
  PHYSICAL_KEYS,
  PREPARED_ONLY_FIELDS,
  RESOURCE_KEYS,
  SANITY_KEYS,
  SANITY_LOSS_KEYS,
  SAN_SENTINEL_MINIMUM,
  SKILL_ENTRY_KEYS,
  SKILL_KEY_MAP,
  STATISTIC_KEYS,
  STAT_KEY_MAP,
  SYSTEM_ID,
  SYSTEM_ROOT_KEYS,
  SYSTEM_VERSION,
  TYPED_SKILL_ENTRY_KEYS,
  TYPED_SKILL_FAMILY_SET,
  UNARMED_COMBAT_GROUP,
  UNARMED_COMBAT_LABEL,
  UNARMED_COMBAT_SKILL_KEY,
  type CanonicalStatId,
  type MappedItemType,
} from "./maps.js";
import {
  asJsonValue,
  contentHashOf,
  decodeInput,
  isCanonicalId,
  isFiniteNumber,
  isRecord,
  ISO_DATE,
  looksLikeHtml,
  normalizeTypedSkillGroup,
  pathToPointer,
  plainTextFrom,
  pointer,
  readBoolean,
  readInt,
  readRecord,
  readText,
  toInt,
  type UnknownRecord,
} from "./values.js";

export type ImportFoundryDeltaGreenOptions = {
  readonly createId?: () => string;
  readonly adapterVersion?: string;
  readonly capturedAt?: string;
};

type NarrativeText = { format: "plain" | "markdown" | "html"; content: string };

type MutableExtensions = {
  identity: {
    actorId?: string;
    items: Record<string, JsonValue>;
    typedSkills: Record<string, JsonValue>;
    specialTraining: Record<string, JsonValue>;
    systemOwnedItems: Record<string, JsonValue>;
  };
  sheet: Record<string, JsonValue>;
  raw: Record<string, JsonValue>;
};

function blockedResult(diagnostic: AdapterDiagnostic): AdapterOperationResult {
  return createOperationResult({ diagnostics: [diagnostic], requiredResolutions: [] });
}

export function importFoundryDeltaGreen(
  input: string | Uint8Array,
  options: ImportFoundryDeltaGreenOptions = {},
): AdapterOperationResult {
  const createId = options.createId ?? createCanonicalId;
  const adapterVersion = options.adapterVersion ?? "0.0.0";
  const { bytes, text } = decodeInput(input);
  const contentHash = contentHashOf(bytes);
  const diagnostics: AdapterDiagnostic[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    return blockedResult(
      fatalStructure(
        `Input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        "",
      ),
    );
  }

  if (!isRecord(parsed)) {
    return blockedResult(fatalStructure("Actor export root must be a JSON object.", ""));
  }
  const source = parsed;

  const actorType = source.type;
  if (actorType !== undefined && actorType !== "agent") {
    return blockedResult(
      fatalStructure(
        `Actor type ${String(actorType)} is unsupported; this capability maps agent Actors only.`,
        "/type",
      ),
    );
  }

  const system = readRecord(source, "system");
  if (system === undefined) {
    return blockedResult(fatalStructure("Actor system data must be an object.", "/system"));
  }

  const statistics = readRecord(system, "statistics");
  for (const key of FOUNDRY_STAT_KEYS) {
    const entry = readRecord(statistics, key);
    if (!isFiniteNumber(entry?.value)) {
      return blockedResult(
        fatalStructure(
          `system.statistics.${key}.value must be a finite number.`,
          pointer("system", "statistics", key, "value"),
        ),
      );
    }
  }

  const documentStats = readRecord(source, "_stats");
  const foundSystemId = documentStats?.systemId;
  if (typeof foundSystemId === "string" && foundSystemId !== SYSTEM_ID) {
    return blockedResult(
      createUnsupportedVersionDiagnostic({
        sourcePath: "/_stats/systemId",
        foundVersion: foundSystemId,
        supportedVersions: [SYSTEM_ID],
      }),
    );
  }

  const foundCoreVersion = typeof documentStats?.coreVersion === "string" ? documentStats.coreVersion : undefined;
  const foundSystemVersion =
    typeof documentStats?.systemVersion === "string" ? documentStats.systemVersion : undefined;
  if (
    foundCoreVersion !== CORE_VERSION ||
    foundSystemVersion !== SYSTEM_VERSION ||
    foundSystemId !== SYSTEM_ID
  ) {
    diagnostics.push(
      warning(
        catalogueDiagnosticCodes.unverifiedVersion,
        `Actor _stats do not prove the exact ${CORE_VERSION} / ${SYSTEM_VERSION} target; import proceeds without an exact-target claim.`,
        "/_stats",
        {
          phase: "detect",
          localizationParameters: {
            foundVersion: `${foundCoreVersion ?? "unknown"}+${foundSystemVersion ?? "unknown"}`,
            supportedVersions: FOUNDRY_VERSION,
          },
          valueSummary: {
            kind: "scalar",
            typeName: "string",
            preview: `${foundCoreVersion ?? "unknown"}+${foundSystemVersion ?? "unknown"}`,
          },
        },
      ),
    );
  }

  const extensions: MutableExtensions = {
    identity: { items: {}, typedSkills: {}, specialTraining: {}, systemOwnedItems: {} },
    sheet: {},
    raw: {},
  };

  function preserveRaw(
    path: string,
    value: unknown,
    message: string,
    severity: "warning" | "information" = "warning",
  ): void {
    extensions.raw[path] = asJsonValue(value);
    const build = severity === "warning" ? warning : information;
    diagnostics.push(
      build(catalogueDiagnosticCodes.preservedUnknown, message, pathToPointer(path), {
        valueSummary: { kind: "type", typeName: Array.isArray(value) ? "array" : typeof value },
      }),
    );
  }

  function sweepUnknown(
    record: UnknownRecord | undefined,
    known: ReadonlySet<string>,
    basePath: string,
    preparedKey?: string,
  ): void {
    if (record === undefined) {
      return;
    }
    const prepared = preparedKey ? PREPARED_ONLY_FIELDS[preparedKey] : undefined;
    for (const [key, value] of Object.entries(record)) {
      if (known.has(key) || prepared?.has(key)) {
        continue;
      }
      preserveRaw(
        `${basePath}.${key}`,
        value,
        `Unclassified persisted path ${basePath}.${key} preserved in extensions.foundry.raw.`,
      );
    }
  }

  const identity: AgentSnapshot["identity"] = {};
  const biography: AgentSnapshot["biography"] = {};
  const statisticsOut: AgentSnapshot["statistics"] = {};
  const resources: AgentSnapshot["resources"] = {};

  const actorName = readText(source, "name");
  if (actorName !== undefined) {
    identity.name = actorName;
  }

  const actorId = readText(source, "_id");
  if (actorId !== undefined) {
    extensions.identity.actorId = actorId;
  }

  // --- adapter flags ---
  const flags = readRecord(source, "flags");
  const adapterFlags = readRecord(flags, ADAPTER_FLAG_NAMESPACE);
  const unrepresentable = readRecord(adapterFlags, "unrepresentable");

  let agentId: string | undefined;
  const boundAgentId = adapterFlags?.agentId;
  if (isCanonicalId(boundAgentId)) {
    agentId = boundAgentId;
  } else if (boundAgentId !== undefined) {
    diagnostics.push(
      warning(
        catalogueDiagnosticCodes.malformedValue,
        "Bound flags.deltaGreenCharacterAdapter.agentId is not a lowercase UUID v4; a new canonical id was generated.",
        "/flags/deltaGreenCharacterAdapter/agentId",
        { canonicalPath: "/agentId" },
      ),
    );
  }

  const flagDateOfBirth = unrepresentable?.dateOfBirth;
  if (typeof flagDateOfBirth === "string" && ISO_DATE.test(flagDateOfBirth)) {
    biography.dateOfBirth = flagDateOfBirth;
  } else if (flagDateOfBirth !== undefined) {
    preserveRaw(
      "flags.deltaGreenCharacterAdapter.unrepresentable.dateOfBirth",
      flagDateOfBirth,
      "Non-ISO adapter flag date of birth omitted from biography.dateOfBirth.",
    );
  }

  const flagAliases = unrepresentable?.aliases;
  if (
    Array.isArray(flagAliases) &&
    flagAliases.length > 0 &&
    flagAliases.every((alias) => typeof alias === "string" && alias.length > 0)
  ) {
    identity.aliases = flagAliases as string[];
  } else if (flagAliases !== undefined) {
    preserveRaw(
      "flags.deltaGreenCharacterAdapter.unrepresentable.aliases",
      flagAliases,
      "Malformed adapter flag aliases omitted from identity.aliases.",
    );
  }

  let traumaticBackground: string | undefined;
  const flagTraumaticBackground = unrepresentable?.traumaticBackground;
  if (typeof flagTraumaticBackground === "string" && flagTraumaticBackground.length > 0) {
    traumaticBackground = flagTraumaticBackground;
  } else if (flagTraumaticBackground !== undefined) {
    preserveRaw(
      "flags.deltaGreenCharacterAdapter.unrepresentable.traumaticBackground",
      flagTraumaticBackground,
      "Malformed adapter flag traumaticBackground omitted from psychology.traumaticBackground.",
    );
  }

  const notes: AgentSnapshot["notes"] = { player: [], handler: [] };
  const flagNotes = readRecord(unrepresentable, "notes");
  if (flagNotes !== undefined) {
    for (const side of ["player", "handler"] as const) {
      const entries = flagNotes[side];
      if (!Array.isArray(entries)) {
        if (entries !== undefined) {
          preserveRaw(
            `flags.deltaGreenCharacterAdapter.unrepresentable.notes.${side}`,
            entries,
            `Malformed adapter flag notes.${side} omitted.`,
          );
        }
        continue;
      }
      for (const [index, entry] of entries.entries()) {
        if (!isRecord(entry) || typeof entry.content !== "string") {
          preserveRaw(
            `flags.deltaGreenCharacterAdapter.unrepresentable.notes.${side}[${index}]`,
            entry,
            `Malformed adapter flag note omitted.`,
          );
          continue;
        }
        const format =
          entry.format === "plain" || entry.format === "markdown" || entry.format === "html"
            ? entry.format
            : "plain";
        notes[side].push({ format, content: entry.content });
      }
    }
  }

  // --- statistics ---
  for (const key of FOUNDRY_STAT_KEYS) {
    const entry = readRecord(statistics, key);
    const score = toInt(entry?.value as number);
    const canonicalKey: CanonicalStatId = STAT_KEY_MAP[key];
    const feature = readText(entry, "distinguishing_feature");
    statisticsOut[canonicalKey] =
      feature === undefined ? { score } : { score, distinguishingFeature: feature };
    if (score < 3 || score > 18) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Statistic ${key}=${score} is outside the usual 3–18 range and was not clamped.`,
          pointer("system", "statistics", key, "value"),
          {
            canonicalPath: pointer("statistics", canonicalKey, "score"),
            valueSummary: { kind: "scalar", typeName: "number", preview: String(score) },
          },
        ),
      );
    }
    sweepUnknown(entry, STATISTIC_KEYS, `system.statistics.${key}`, "system.statistics.<stat>");
  }
  sweepUnknown(statistics, new Set(FOUNDRY_STAT_KEYS), "system.statistics");

  const strength = toInt(readRecord(statistics, "str")?.value as number);
  const constitution = toInt(readRecord(statistics, "con")?.value as number);
  const power = toInt(readRecord(statistics, "pow")?.value as number);

  // --- resources ---
  function resolveResource(
    key: "health" | "wp",
    formulaMaximum: number,
    canonicalKey: "hitPoints" | "willpower",
  ): void {
    const record = readRecord(system, key);
    const persistedMax = readInt(record, "max");
    if (persistedMax !== undefined && persistedMax !== formulaMaximum) {
      extensions.raw[`system.${key}.max`] = persistedMax;
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.derivedConflict,
          `Persisted system.${key}.max=${persistedMax} disagrees with the system formula value ${formulaMaximum}; the formula value is canonical.`,
          pointer("system", key, "max"),
          {
            canonicalPath: pointer("resources", canonicalKey, "maximum"),
            valueSummary: { kind: "scalar", typeName: "number", preview: String(persistedMax) },
          },
        ),
      );
    }
    const persistedMin = readInt(record, "min");
    if (persistedMin !== undefined) {
      extensions.sheet[`${key}Min`] = persistedMin;
    }
    const current = readInt(record, "value");
    if (current === undefined) {
      diagnostics.push(
        information(
          catalogueDiagnosticCodes.safeDefault,
          `Missing system.${key}.value; defaulted to the formula maximum ${formulaMaximum}.`,
          pointer("system", key, "value"),
          { canonicalPath: pointer("resources", canonicalKey, "current") },
        ),
      );
    }
    resources[canonicalKey] = { current: current ?? formulaMaximum, maximum: formulaMaximum };
    sweepUnknown(record, RESOURCE_KEYS, `system.${key}`, `system.${key}`);
  }

  resolveResource("health", Math.ceil((strength + constitution) / 2), "hitPoints");
  resolveResource("wp", power, "willpower");

  const sanity = readRecord(system, "sanity");
  const sanityMaximum = power * 5;
  const persistedSanity = readInt(sanity, "value");
  const sanitySentinel = persistedSanity === undefined || persistedSanity >= SAN_SENTINEL_MINIMUM;
  let sanityCurrent = sanityMaximum;
  if (sanitySentinel) {
    if (persistedSanity !== undefined) {
      diagnostics.push(
        knownLoss(
          "information",
          "san-sentinel-collides-with-explicit-high-san",
          `system.sanity.value=${persistedSanity} is the Foundry initialization sentinel; sanity was normalized to POW×5 (${sanityMaximum}).`,
          { sourcePath: "/system/sanity/value", canonicalPath: "/resources/sanity" },
        ),
      );
    }
  } else {
    sanityCurrent = persistedSanity;
    if (sanityCurrent !== sanityMaximum) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.derivedConflict,
          `Explicit system.sanity.value=${sanityCurrent} disagrees with the POW×5 maximum ${sanityMaximum}; the explicit current was kept.`,
          "/system/sanity/value",
          {
            canonicalPath: "/resources/sanity/current",
            valueSummary: { kind: "scalar", typeName: "number", preview: String(sanityCurrent) },
          },
        ),
      );
    }
  }
  resources.sanity = { current: sanityCurrent, maximum: sanityMaximum };

  const persistedBreakingPoint = readInt(sanity, "currentBreakingPoint");
  const derivedBreakingPoint = sanityCurrent - power;
  let breakingPointCurrent: number;
  if (persistedBreakingPoint === undefined) {
    breakingPointCurrent = derivedBreakingPoint;
    diagnostics.push(
      information(
        catalogueDiagnosticCodes.safeDefault,
        `Missing system.sanity.currentBreakingPoint; derived SAN−POW (${derivedBreakingPoint}).`,
        "/system/sanity/currentBreakingPoint",
        { canonicalPath: "/resources/breakingPoint/current" },
      ),
    );
  } else if (persistedBreakingPoint === BREAKING_POINT_SENTINEL && sanitySentinel) {
    breakingPointCurrent = derivedBreakingPoint;
    diagnostics.push(
      information(
        catalogueDiagnosticCodes.safeNormalization,
        `system.sanity.currentBreakingPoint=${BREAKING_POINT_SENTINEL} is the initialization sentinel; derived SAN−POW (${derivedBreakingPoint}).`,
        "/system/sanity/currentBreakingPoint",
        { canonicalPath: "/resources/breakingPoint/current" },
      ),
    );
  } else {
    breakingPointCurrent = persistedBreakingPoint;
  }

  const flagBaseline = unrepresentable?.breakingPointBaseline;
  let breakingPointBaseline: number;
  if (isFiniteNumber(flagBaseline)) {
    breakingPointBaseline = toInt(flagBaseline);
  } else if (breakingPointCurrent === derivedBreakingPoint) {
    breakingPointBaseline = breakingPointCurrent;
  } else {
    breakingPointBaseline = breakingPointCurrent;
    diagnostics.push(
      warning(
        catalogueDiagnosticCodes.derivedConflict,
        `Breaking point baseline is not persisted by Foundry and could not be derived from SAN−POW; the current value ${breakingPointCurrent} was reused as the baseline.`,
        "/system/sanity/currentBreakingPoint",
        { canonicalPath: "/resources/breakingPoint/baseline" },
      ),
    );
  }
  if (flagBaseline !== undefined && !isFiniteNumber(flagBaseline)) {
    preserveRaw(
      "flags.deltaGreenCharacterAdapter.unrepresentable.breakingPointBaseline",
      flagBaseline,
      "Malformed adapter flag breaking point baseline ignored.",
    );
  }
  resources.breakingPoint = { current: breakingPointCurrent, baseline: breakingPointBaseline };
  diagnostics.push(
    knownLoss(
      "information",
      "breaking-point-baseline-derived",
      "Foundry persists only the current breaking point; the canonical baseline is taken from adapter flags or derived.",
      { sourcePath: "/system/sanity/currentBreakingPoint", canonicalPath: "/resources/breakingPoint/baseline" },
    ),
  );

  // --- adaptations ---
  const adaptationsRecord = readRecord(sanity, "adaptations");
  const adaptations: AgentSnapshot["psychology"]["adaptations"] = [];
  for (const kind of ADAPTATION_KINDS) {
    const entry = readRecord(adaptationsRecord, kind);
    let marks = 0;
    for (const incident of ["incident1", "incident2", "incident3"] as const) {
      if (entry?.[incident] === true) {
        marks += 1;
      }
    }
    adaptations.push({ id: createId(), kind, incidentMarks: marks, adapted: marks === 3 });
    sweepUnknown(
      entry,
      ADAPTATION_ENTRY_KEYS,
      `system.sanity.adaptations.${kind}`,
      "system.sanity.adaptations.<kind>",
    );
  }
  sweepUnknown(adaptationsRecord, new Set(ADAPTATION_KINDS), "system.sanity.adaptations");
  sweepUnknown(sanity, SANITY_KEYS, "system.sanity", "system.sanity");

  const flagOtherAdaptations = unrepresentable?.otherAdaptations;
  if (Array.isArray(flagOtherAdaptations)) {
    for (const [index, entry] of flagOtherAdaptations.entries()) {
      if (!isRecord(entry)) {
        preserveRaw(
          `flags.deltaGreenCharacterAdapter.unrepresentable.otherAdaptations[${index}]`,
          entry,
          "Malformed adapter flag otherAdaptation omitted.",
        );
        continue;
      }
      const label = typeof entry.label === "string" ? entry.label : undefined;
      const incidentMarks =
        typeof entry.incidentMarks === "number" && Number.isInteger(entry.incidentMarks)
          ? Math.min(3, Math.max(0, entry.incidentMarks))
          : undefined;
      const adapted = typeof entry.adapted === "boolean" ? entry.adapted : undefined;
      adaptations.push({
        id: createId(),
        kind: "other",
        ...(label !== undefined ? { label } : {}),
        ...(incidentMarks !== undefined ? { incidentMarks } : {}),
        ...(adapted !== undefined ? { adapted } : {}),
      });
    }
  } else if (flagOtherAdaptations !== undefined) {
    preserveRaw(
      "flags.deltaGreenCharacterAdapter.unrepresentable.otherAdaptations",
      flagOtherAdaptations,
      "Malformed adapter flag otherAdaptations omitted.",
    );
  }

  diagnostics.push(
    knownLoss(
      "information",
      "other-adaptations-unsupported",
      "Foundry models only violence and helplessness incident bits; kind=other adaptations cannot originate from system fields and are recovered only from adapter flags when present.",
      { sourcePath: "/system/sanity/adaptations", canonicalPath: "/psychology/adaptations" },
    ),
  );

  // --- physical ---
  const physical = readRecord(system, "physical");
  const physicalDescription = readText(physical, "description");
  if (physicalDescription !== undefined) {
    biography.physicalDescription = { format: "html", content: physicalDescription };
  }
  const wounds = readText(physical, "wounds");
  if (wounds !== undefined) {
    resources.wounds = { format: looksLikeHtml(wounds) ? "html" : "plain", content: wounds };
  }
  const exhausted = readBoolean(physical, "exhausted");
  if (exhausted !== undefined) {
    resources.exhausted = exhausted;
  }
  const firstAidAttempted = readBoolean(physical, "firstAidAttempted");
  if (firstAidAttempted !== undefined) {
    resources.firstAidAttempted = firstAidAttempted;
  }
  const exhaustedPenalty = readInt(physical, "exhaustedPenalty");
  if (exhaustedPenalty !== undefined) {
    extensions.sheet.exhaustedPenalty = exhaustedPenalty;
  }
  sweepUnknown(physical, PHYSICAL_KEYS, "system.physical");

  // --- biography ---
  const biographyRecord = readRecord(system, "biography");
  for (const key of ["profession", "employer", "nationality", "sex", "education"] as const) {
    const value = readText(biographyRecord, key);
    if (value !== undefined) {
      biography[key] = value;
    }
  }
  const age = biographyRecord?.age;
  if (typeof age === "number" && Number.isInteger(age) && age >= 0) {
    biography.age = age;
  } else if (typeof age === "string" && age.trim().length > 0) {
    const trimmed = age.trim();
    if (/^\d+$/.test(trimmed)) {
      biography.age = Number.parseInt(trimmed, 10);
    } else {
      extensions.raw["system.biography.age"] = age;
      diagnostics.push(
        knownLoss(
          "warning",
          "non-digit-age-omitted",
          `Non-digit system.biography.age text was preserved in extensions.foundry.raw and omitted from biography.age.`,
          { sourcePath: "/system/biography/age", canonicalPath: "/biography/age" },
        ),
      );
    }
  } else if (age !== undefined && age !== "" && typeof age !== "string") {
    preserveRaw("system.biography.age", age, "Non-string system.biography.age omitted from biography.age.");
  }
  sweepUnknown(biographyRecord, BIOGRAPHY_KEYS, "system.biography");

  // --- campaign state ---
  const corruption = readRecord(system, "corruption");
  const corruptionValue = readInt(corruption, "value");
  const seenTheYellowSign = readBoolean(corruption, "haveSeenTheYellowSign");
  const gift = readText(corruption, "gift");
  const insight = readText(corruption, "insight");
  const campaignState: AgentSnapshot["campaignState"] = {};
  if (
    (corruptionValue !== undefined && corruptionValue !== 0) ||
    seenTheYellowSign === true ||
    gift !== undefined ||
    insight !== undefined
  ) {
    campaignState.impossibleLandscapes = {
      ...(corruptionValue !== undefined ? { corruption: corruptionValue } : {}),
      ...(seenTheYellowSign !== undefined ? { seenTheYellowSign } : {}),
      ...(gift !== undefined ? { gift } : {}),
      ...(insight !== undefined ? { insight } : {}),
    };
  }
  sweepUnknown(corruption, CORRUPTION_KEYS, "system.corruption");

  // --- sheet extension ---
  const schemaVersion = readInt(system, "schemaVersion");
  if (schemaVersion !== undefined) {
    extensions.sheet.schemaVersion = schemaVersion;
  }
  const settings = readRecord(system, "settings");
  if (settings !== undefined) {
    extensions.sheet.settings = asJsonValue(settings);
  }

  // --- skills ---
  const standard: Partial<Record<StandardSkillId, { proficiency: number; failureMarked: boolean }>> = {};
  const custom: AgentSnapshot["skills"]["custom"] = [];
  const customSkillIdByFoundryKey = new Map<string, string>();
  const skills = readRecord(system, "skills");

  for (const [key, value] of Object.entries(skills ?? {})) {
    if (!isRecord(value)) {
      preserveRaw(`system.skills.${key}`, value, `Malformed system.skills.${key} entry preserved.`);
      continue;
    }
    const proficiencyValue = value.proficiency;
    if (!isFiniteNumber(proficiencyValue)) {
      preserveRaw(
        `system.skills.${key}`,
        value,
        `system.skills.${key} has a non-finite proficiency and was not imported.`,
      );
      continue;
    }
    const proficiency = toInt(proficiencyValue);
    if (proficiency < 0 || proficiency > 99) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Skill proficiency ${proficiency} for ${key} is outside 0–99 and was not clamped.`,
          pointer("system", "skills", key, "proficiency"),
          { valueSummary: { kind: "scalar", typeName: "number", preview: String(proficiency) } },
        ),
      );
    }
    const failureMarked = value.failure === true;
    sweepUnknown(value, SKILL_ENTRY_KEYS, `system.skills.${key}`, "system.skills.<key>");

    if (key === UNARMED_COMBAT_SKILL_KEY) {
      const id = createId();
      customSkillIdByFoundryKey.set(key, id);
      custom.push({
        id,
        group: UNARMED_COMBAT_GROUP,
        label: readText(value, "label") ?? UNARMED_COMBAT_LABEL,
        proficiency,
        failureMarked,
      });
      diagnostics.push(
        knownLoss(
          "warning",
          "unarmed-combat-not-standard",
          "Canonical Agent 1.0.0 has no unarmedCombat standard skill; the Foundry rating was imported as a custom skill.",
          { sourcePath: "/system/skills/unarmed_combat", canonicalPath: "/skills/custom" },
        ),
      );
      continue;
    }

    const standardId = SKILL_KEY_MAP[key];
    if (standardId !== undefined) {
      standard[standardId] = { proficiency, failureMarked };
      continue;
    }

    const id = createId();
    customSkillIdByFoundryKey.set(key, id);
    custom.push({
      id,
      group: key,
      label: readText(value, "label") ?? key,
      proficiency,
      failureMarked,
    });
    diagnostics.push(
      warning(
        catalogueDiagnosticCodes.safeNormalization,
        `Unknown Foundry skill key ${key} imported as a custom skill.`,
        pointer("system", "skills", key),
        { canonicalPath: "/skills/custom" },
      ),
    );
  }

  const typedSkills = readRecord(system, "typedSkills");
  const customSkillIdByTypedKey = new Map<string, string>();
  for (const [typedKey, value] of Object.entries(typedSkills ?? {})) {
    if (!isRecord(value)) {
      preserveRaw(
        `system.typedSkills.${typedKey}`,
        value,
        `Malformed system.typedSkills.${typedKey} entry preserved.`,
      );
      continue;
    }
    const proficiency = readInt(value, "proficiency") ?? 0;
    const rawGroup = readText(value, "group") ?? "";
    const normalizedGroup = normalizeTypedSkillGroup(rawGroup);
    const group = normalizedGroup.length > 0 ? normalizedGroup : "typed_skill";
    if (!TYPED_SKILL_FAMILY_SET.has(group)) {
      extensions.raw[`system.typedSkills.${typedKey}.group`] = rawGroup;
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Typed skill group ${rawGroup || "(empty)"} is not a handbook family; the normalized group ${group} was used.`,
          pointer("system", "typedSkills", typedKey, "group"),
          { canonicalPath: "/skills/custom" },
        ),
      );
    }
    const id = createId();
    customSkillIdByTypedKey.set(typedKey, id);
    extensions.identity.typedSkills[id] = typedKey;
    custom.push({
      id,
      group,
      label: readText(value, "label") ?? group,
      proficiency,
      failureMarked: value.failure === true,
    });
    sweepUnknown(value, TYPED_SKILL_ENTRY_KEYS, `system.typedSkills.${typedKey}`, "system.skills.<key>");
  }

  const specialTraining: AgentSnapshot["skills"]["specialTraining"] = [];
  const specialTrainingSource = system.specialTraining;
  if (Array.isArray(specialTrainingSource)) {
    for (const [index, entry] of specialTrainingSource.entries()) {
      if (!isRecord(entry)) {
        preserveRaw(
          `system.specialTraining[${index}]`,
          entry,
          "Malformed special training entry preserved.",
        );
        continue;
      }
      const attribute = typeof entry.attribute === "string" ? entry.attribute : "";
      let uses: AgentSnapshot["skills"]["specialTraining"][number]["uses"] | undefined;
      if ((FOUNDRY_STAT_KEYS as readonly string[]).includes(attribute)) {
        uses = { kind: "statistic", statistic: STAT_KEY_MAP[attribute as keyof typeof STAT_KEY_MAP] };
      } else if (SKILL_KEY_MAP[attribute] !== undefined) {
        uses = { kind: "standardSkill", skill: SKILL_KEY_MAP[attribute] as StandardSkillId };
      } else {
        const boundCustom =
          customSkillIdByTypedKey.get(attribute) ?? customSkillIdByFoundryKey.get(attribute);
        if (boundCustom !== undefined) {
          uses = { kind: "customSkill", skillId: boundCustom };
        }
      }
      if (uses === undefined) {
        preserveRaw(
          `system.specialTraining[${index}]`,
          entry,
          `Special training attribute ${attribute || "(empty)"} does not resolve to a statistic, standard skill, or bound custom skill.`,
        );
        continue;
      }
      let name = typeof entry.name === "string" ? entry.name.trim() : "";
      if (name.length === 0) {
        extensions.raw[`system.specialTraining[${index}].name`] = entry.name === undefined ? null : asJsonValue(entry.name);
        name = "Special Training";
        diagnostics.push(
          warning(
            catalogueDiagnosticCodes.missingRecommended,
            "Special training entry has no name; a placeholder name was used.",
            pointer("system", "specialTraining", index, "name"),
            { canonicalPath: "/skills/specialTraining" },
          ),
        );
      }
      const id = createId();
      const localId = readText(entry, "id");
      if (localId !== undefined) {
        extensions.identity.specialTraining[id] = localId;
      }
      specialTraining.push({ id, name, uses });
      sweepUnknown(
        entry,
        new Set(["name", "attribute", "id"]),
        `system.specialTraining[${index}]`,
      );
    }
  } else if (specialTrainingSource !== undefined) {
    preserveRaw("system.specialTraining", specialTrainingSource, "Malformed system.specialTraining preserved.");
  }

  sweepUnknown(system, SYSTEM_ROOT_KEYS, "system");

  // --- embedded items ---
  const bonds: AgentSnapshot["relationships"]["bonds"] = [];
  const motivations: AgentSnapshot["psychology"]["motivations"] = [];
  const disorders: AgentSnapshot["psychology"]["disorders"] = [];
  const weapons: AgentSnapshot["inventory"]["weapons"] = [];
  const armor: AgentSnapshot["inventory"]["armor"] = [];
  const gear: AgentSnapshot["inventory"]["gear"] = [];
  const tomes: AgentSnapshot["inventory"]["tomes"] = [];
  const rituals: AgentSnapshot["inventory"]["rituals"] = [];

  function narrative(record: UnknownRecord | undefined, key: string): NarrativeText | undefined {
    const content = readText(record, key);
    return content === undefined ? undefined : { format: "html", content };
  }

  function sanityLossOf(record: UnknownRecord | undefined): AgentSnapshot["inventory"]["tomes"][number]["sanityLoss"] {
    if (record === undefined) {
      return undefined;
    }
    const success = readText(record, "successLoss");
    const failure = readText(record, "failedLoss");
    const notes = readText(record, "notes");
    if (success === undefined && failure === undefined && notes === undefined) {
      return undefined;
    }
    return {
      ...(success !== undefined ? { success } : {}),
      ...(failure !== undefined ? { failure } : {}),
      ...(notes !== undefined ? { notes } : {}),
    };
  }

  function itemName(item: UnknownRecord, itemSystem: UnknownRecord | undefined, index: number, fallback: string): string {
    const name = readText(item, "name");
    if (name !== undefined) {
      return name;
    }
    const description = readText(itemSystem, "description");
    const derived = description === undefined ? "" : plainTextFrom(description);
    if (derived.length > 0) {
      return derived;
    }
    diagnostics.push(
      warning(
        catalogueDiagnosticCodes.missingRecommended,
        `Embedded item at index ${index} has no name; the placeholder ${fallback} was used.`,
        pointer("items", index, "name"),
      ),
    );
    return fallback;
  }

  const itemsSource = source.items;
  if (Array.isArray(itemsSource)) {
    for (const [index, entry] of itemsSource.entries()) {
      if (!isRecord(entry)) {
        preserveRaw(`items[${index}]`, entry, `Malformed embedded item at index ${index} preserved.`);
        continue;
      }
      const itemType = typeof entry.type === "string" ? entry.type : "";
      const itemSystem = readRecord(entry, "system");
      const foundryItemId = readText(entry, "_id");

      if (!MAPPED_ITEM_TYPE_SET.has(itemType)) {
        preserveRaw(
          `items[${index}]`,
          entry,
          `Unknown embedded item type ${itemType || "(missing)"} preserved without inventory mapping.`,
        );
        continue;
      }
      const mappedType = itemType as MappedItemType;
      const canonicalItemId = createId();
      if (foundryItemId !== undefined) {
        extensions.identity.items[canonicalItemId] = foundryItemId;
      }
      const systemFlags = readRecord(readRecord(entry, "flags"), "deltagreen");
      if (systemFlags !== undefined && Object.keys(systemFlags).length > 0) {
        extensions.identity.systemOwnedItems[canonicalItemId] = asJsonValue(systemFlags);
      }

      const description = narrative(itemSystem, "description");
      const name = itemName(entry, itemSystem, index, `Untitled ${mappedType}`);
      const knownFields = new Set(ITEM_SYSTEM_FIELDS[mappedType]);
      sweepUnknown(itemSystem, knownFields, `items[${index}].system`);

      switch (mappedType) {
        case "bond": {
          const descriptionText = description === undefined ? "" : plainTextFrom(description.content);
          if (descriptionText.length > 0 && descriptionText !== name) {
            diagnostics.push(
              warning(
                catalogueDiagnosticCodes.ambiguousIdentity,
                `Bond name and description disagree at items[${index}]; the Item name was preferred.`,
                pointer("items", index),
                { canonicalPath: "/relationships/bonds" },
              ),
            );
          }
          const relationship = readText(itemSystem, "relationship");
          bonds.push({
            id: canonicalItemId,
            name,
            ...(relationship !== undefined ? { relationship } : {}),
            ...(description !== undefined ? { description } : {}),
            score: readInt(itemSystem, "score") ?? 0,
            damagedSinceLastHomeScene: itemSystem?.hasBeenDamagedSinceLastHomeScene === true,
          });
          break;
        }
        case "motivation": {
          const descriptionContent = description?.content ?? "";
          const descriptionText = plainTextFrom(descriptionContent);
          if (descriptionText.length > 0 && descriptionText !== name) {
            diagnostics.push(
              warning(
                catalogueDiagnosticCodes.ambiguousIdentity,
                `Motivation name and description disagree at items[${index}]; the Item name was preferred.`,
                pointer("items", index),
                { canonicalPath: "/psychology/motivations" },
              ),
            );
            extensions.raw[`items[${index}].system.description`] = descriptionContent;
          }
          const disorderName = readText(itemSystem, "disorder");
          let linkedDisorderId: string | undefined;
          if (disorderName !== undefined) {
            linkedDisorderId = createId();
            disorders.push({
              id: linkedDisorderId,
              name: disorderName,
              cured: itemSystem?.disorderCured === true,
            });
          }
          motivations.push({
            id: canonicalItemId,
            statement: name,
            crossedOut: itemSystem?.crossedOut === true,
            ...(linkedDisorderId !== undefined ? { linkedDisorderId } : {}),
          });
          break;
        }
        case "weapon": {
          const rawSkill = readText(itemSystem, "skill");
          let skill: string;
          if (rawSkill === undefined) {
            skill = "unspecified";
            diagnostics.push(
              warning(
                catalogueDiagnosticCodes.missingRecommended,
                `Weapon at items[${index}] has no skill key; the placeholder skill "unspecified" was used.`,
                pointer("items", index, "system", "skill"),
                { canonicalPath: "/inventory/weapons" },
              ),
            );
          } else {
            skill = SKILL_KEY_MAP[rawSkill] ?? rawSkill;
          }
          for (const extensionOnly of ["isLethal", "customSkillTarget"] as const) {
            if (itemSystem !== undefined && extensionOnly in itemSystem) {
              extensions.raw[`items[${index}].system.${extensionOnly}`] = asJsonValue(
                itemSystem[extensionOnly],
              );
            }
          }
          diagnostics.push(
            knownLoss(
              "information",
              "weapon-islethal-custom-target-extension-only",
              "Foundry weapon isLethal and customSkillTarget have no canonical fields; they were retained under extensions.foundry.raw.",
              { sourcePath: pointer("items", index), canonicalPath: "/inventory/weapons" },
            ),
          );
          const range = readText(itemSystem, "range");
          const damage = readText(itemSystem, "damage");
          const killRadius = readText(itemSystem, "killRadius");
          const ammunition = readText(itemSystem, "ammo");
          const expense = readText(itemSystem, "expense");
          const skillModifier = readInt(itemSystem, "skillModifier");
          const armorPiercing = readInt(itemSystem, "armorPiercing");
          const lethality = readInt(itemSystem, "lethality");
          weapons.push({
            id: canonicalItemId,
            name,
            ...(description !== undefined ? { description } : {}),
            skill,
            ...(skillModifier !== undefined ? { skillModifier } : {}),
            ...(range !== undefined ? { range } : {}),
            ...(damage !== undefined ? { damage } : {}),
            ...(armorPiercing !== undefined ? { armorPiercing } : {}),
            ...(lethality !== undefined ? { lethality } : {}),
            ...(killRadius !== undefined ? { killRadius } : {}),
            ...(ammunition !== undefined ? { ammunition } : {}),
            ...(expense !== undefined ? { expense } : {}),
            equipped: itemSystem?.equipped === true,
          });
          break;
        }
        case "armor": {
          const expense = readText(itemSystem, "expense");
          armor.push({
            id: canonicalItemId,
            name,
            ...(description !== undefined ? { description } : {}),
            protection: readInt(itemSystem, "protection") ?? 0,
            ...(expense !== undefined ? { expense } : {}),
            equipped: itemSystem?.equipped === true,
          });
          break;
        }
        case "gear": {
          const expense = readText(itemSystem, "expense");
          gear.push({
            id: canonicalItemId,
            name,
            ...(description !== undefined ? { description } : {}),
            ...(expense !== undefined ? { expense } : {}),
            equipped: itemSystem?.equipped === true,
          });
          break;
        }
        case "tome": {
          const language = readText(itemSystem, "language");
          const studyTime = readText(itemSystem, "studyTime");
          const sanityLoss = sanityLossOf(readRecord(itemSystem, "sanity"));
          sweepUnknown(readRecord(itemSystem, "sanity"), SANITY_LOSS_KEYS, `items[${index}].system.sanity`);
          const unnaturalSkillIncrease = readInt(itemSystem, "unnaturalSkillIncrease");
          const occultSkillIncrease = readInt(itemSystem, "occultSkillIncrease");
          const handlerNotes = narrative(itemSystem, "handlerNotes");
          tomes.push({
            id: canonicalItemId,
            name,
            ...(description !== undefined ? { description } : {}),
            ...(language !== undefined ? { language } : {}),
            ...(studyTime !== undefined ? { studyTime } : {}),
            ...(sanityLoss !== undefined ? { sanityLoss } : {}),
            ...(unnaturalSkillIncrease !== undefined ? { unnaturalSkillIncrease } : {}),
            ...(occultSkillIncrease !== undefined ? { occultSkillIncrease } : {}),
            ...(handlerNotes !== undefined ? { handlerNotes } : {}),
            revealed: itemSystem?.revealed === true,
          });
          break;
        }
        case "ritual": {
          const studyTime = readText(itemSystem, "studyTime");
          const sanityLoss = sanityLossOf(readRecord(itemSystem, "sanity"));
          const learnedSanityLoss = sanityLossOf(readRecord(itemSystem, "learnedSanity"));
          sweepUnknown(readRecord(itemSystem, "sanity"), SANITY_LOSS_KEYS, `items[${index}].system.sanity`);
          sweepUnknown(
            readRecord(itemSystem, "learnedSanity"),
            SANITY_LOSS_KEYS,
            `items[${index}].system.learnedSanity`,
          );
          const unnaturalSkillIncrease = readInt(itemSystem, "unnaturalSkillIncrease");
          const activationCosts = readText(itemSystem, "activationCosts");
          const activationTime = readText(itemSystem, "activationTime");
          const complexity = readText(itemSystem, "complexity");
          const handlerNotes = narrative(itemSystem, "handlerNotes");
          rituals.push({
            id: canonicalItemId,
            name,
            ...(description !== undefined ? { description } : {}),
            ...(studyTime !== undefined ? { studyTime } : {}),
            ...(sanityLoss !== undefined ? { sanityLoss } : {}),
            ...(learnedSanityLoss !== undefined ? { learnedSanityLoss } : {}),
            ...(unnaturalSkillIncrease !== undefined ? { unnaturalSkillIncrease } : {}),
            ...(activationCosts !== undefined ? { activationCosts } : {}),
            ...(activationTime !== undefined ? { activationTime } : {}),
            ...(complexity !== undefined ? { complexity } : {}),
            ...(handlerNotes !== undefined ? { handlerNotes } : {}),
            revealed: itemSystem?.revealed === true,
          });
          break;
        }
      }
    }
  } else if (itemsSource !== undefined) {
    preserveRaw("items", itemsSource, "Malformed embedded items collection preserved.");
  }

  for (const key of Object.keys(source)) {
    if (!ACTOR_ROOT_KEYS.has(key)) {
      preserveRaw(key, source[key], `Unknown Actor root key ${key} preserved in extensions.foundry.raw.`);
    }
  }

  diagnostics.push(
    knownLoss(
      "information",
      "no-general-agent-notes",
      notes.player.length > 0 || notes.handler.length > 0
        ? "Delta Green 1.7.0 Agents have no general notes fields; notes were recovered from adapter flags."
        : "Delta Green 1.7.0 Agents have no general notes fields; notes.player and notes.handler import empty unless adapter flags supply them.",
      { canonicalPath: "/notes" },
    ),
  );
  diagnostics.push(
    knownLoss(
      "information",
      "foundry-ids-not-canonical",
      "Foundry document and collection ids are correlation evidence only; canonical ids were generated where unbound.",
      { canonicalPath: "/agentId" },
    ),
  );
  diagnostics.push(
    knownLoss(
      "information",
      "presentation-and-effects-dropped",
      "Foundry-owned presentation, access, ActiveEffects, and third-party flags are not Agent interchange meaning and were omitted.",
      { canonicalPath: "" },
    ),
  );

  const snapshot: AgentSnapshot = parseAgentSnapshot({
    schemaVersion: "1.0.0",
    agentId: agentId ?? createId(),
    identity,
    biography,
    statistics: statisticsOut,
    resources,
    skills: { standard, custom, specialTraining },
    relationships: { bonds },
    psychology: {
      motivations,
      disorders,
      adaptations,
      ...(traumaticBackground !== undefined ? { traumaticBackground } : {}),
    },
    inventory: { weapons, armor, gear, rituals, tomes },
    notes,
    campaignState,
    provenance: {
      adapter: { id: IMPORT_ADAPTER_ID, version: adapterVersion },
      source: {
        format: FOUNDRY_FORMAT,
        version: FOUNDRY_VERSION,
        ...(actorId !== undefined ? { recordId: actorId } : {}),
      },
      ...(options.capturedAt !== undefined ? { capturedAt: options.capturedAt } : {}),
      contentHash,
    },
    extensions: {
      foundry: {
        identity: asJsonValue(extensions.identity) as Record<string, JsonValue>,
        sheet: extensions.sheet,
        raw: extensions.raw,
      },
    },
  });

  return createOperationResult({ diagnostics, requiredResolutions: [], output: snapshot });
}
