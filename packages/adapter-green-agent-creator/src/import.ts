import { createHash } from "node:crypto";

import {
  createOperationResult,
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
  diagnostic,
  fatalStructure,
  information,
  warning,
} from "./diagnostic-helpers.js";
import {
  ADAPTER_ID,
  KNOWN_ROOT_KEYS,
  KNOWN_TRAUMATIC_BACKGROUNDS,
  PERSONAL_INFO_KEYS,
  PROFESSION_KEY_MAP,
  SKILL_KEY_MAP,
  SOURCE_FORMAT,
  SOURCE_VERSION,
  STAT_KEY_MAP,
  STAT_KEYS,
  TYPED_SKILL_FAMILIES,
  WORKFLOW_ROOT_KEYS,
} from "./maps.js";

export type ImportGreenAgentCreatorOptions = {
  readonly createId?: () => string;
  readonly adapterVersion?: string;
  readonly capturedAt?: string;
};

type MutableExtensions = {
  workflow: Record<string, JsonValue>;
  skillConstruction: Record<string, JsonValue>;
  sheetBaseline: Record<string, JsonValue>;
  identity: Record<string, JsonValue>;
  raw: Record<string, JsonValue>;
};

function asJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => asJsonValue(item));
  }
  if (typeof value === "object") {
    const out: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = asJsonValue(entry);
    }
    return out;
  }
  return String(value);
}

function contentHashOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function decodeInput(input: string | Uint8Array): { bytes: Uint8Array; text: string } {
  if (typeof input === "string") {
    return { bytes: new TextEncoder().encode(input), text: input };
  }
  return { bytes: input, text: new TextDecoder().decode(input) };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toInt(value: number): number {
  return Math.trunc(value);
}

function normalizeAdaptationLabel(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function deriveMaxima(input: {
  readonly str: number;
  readonly con: number;
  readonly pow: number;
  readonly traumaticBackground: string | null | undefined;
  readonly basePOW: unknown;
}): { HP: number; WP: number; SAN: number; BP: number } {
  const HP = Math.ceil((input.str + input.con) / 2);
  const WP = input.pow;
  const powForSan =
    input.traumaticBackground === "captivity" && isFiniteNumber(input.basePOW)
      ? input.basePOW
      : input.pow;
  let SAN = powForSan * 5;
  const bg = input.traumaticBackground;
  if (bg === "extreme_violence" || bg === "captivity" || bg === "hard_experience") {
    SAN = Math.max(0, SAN - 5);
  } else if (bg === "things_man_was_not_meant_to_know") {
    SAN = Math.max(0, SAN - WP);
  }
  const BP = Math.max(0, SAN - WP);
  return { HP, WP, SAN, BP };
}

function pointer(...segments: Array<string | number>): string {
  return `/${segments.map((segment) => String(segment).replace(/~/g, "~0").replace(/\//g, "~1")).join("/")}`;
}

function pathToPointer(path: string): string {
  if (path.startsWith("/")) {
    return path;
  }
  return `/${path.replace(/\[(\d+)\]/g, "/$1").replace(/\./g, "/")}`;
}

function preserveRaw(
  extensions: MutableExtensions,
  diagnostics: AdapterDiagnostic[],
  path: string,
  value: unknown,
  message: string,
  severity: "warning" | "information" = "warning",
): void {
  extensions.raw[path] = asJsonValue(value);
  const code = catalogueDiagnosticCodes.preservedUnknown;
  const sourcePath = pathToPointer(path);
  if (severity === "warning") {
    diagnostics.push(
      warning(code, message, sourcePath, {
        valueSummary: { kind: "type", typeName: typeof value },
      }),
    );
  } else {
    diagnostics.push(
      information(code, message, sourcePath, {
        valueSummary: { kind: "type", typeName: typeof value },
      }),
    );
  }
}

export function importGreenAgentCreator(
  input: string | Uint8Array,
  options: ImportGreenAgentCreatorOptions = {},
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
    return createOperationResult({
      diagnostics: [
        fatalStructure(
          `Input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
          "",
        ),
      ],
      requiredResolutions: [],
    });
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return createOperationResult({
      diagnostics: [fatalStructure("Root must be a JSON object.", "")],
      requiredResolutions: [],
    });
  }

  const source = parsed as Record<string, unknown>;
  const statsValue = source.stats;
  if (statsValue === null || typeof statsValue !== "object" || Array.isArray(statsValue)) {
    return createOperationResult({
      diagnostics: [fatalStructure("stats must be an object.", "/stats")],
      requiredResolutions: [],
    });
  }
  const stats = statsValue as Record<string, unknown>;

  for (const key of STAT_KEYS) {
    const value = stats[key];
    if (!isFiniteNumber(value)) {
      return createOperationResult({
        diagnostics: [
          fatalStructure(
            `stats.${key} must be a finite number.`,
            pointer("stats", key),
          ),
        ],
        requiredResolutions: [],
      });
    }
  }

  if (!Array.isArray(source.skills)) {
    return createOperationResult({
      diagnostics: [fatalStructure("skills must be an array.", "/skills")],
      requiredResolutions: [],
    });
  }

  const extensions: MutableExtensions = {
    workflow: {},
    skillConstruction: {},
    sheetBaseline: {},
    identity: {},
    raw: {},
  };

  const identity: AgentSnapshot["identity"] = {};
  const biography: AgentSnapshot["biography"] = {};
  const statistics: AgentSnapshot["statistics"] = {};
  const resources: AgentSnapshot["resources"] = {};

  // --- stats + distinguishing features ---
  const distinguishing =
    source.distinguishingFeatures !== null &&
    typeof source.distinguishingFeatures === "object" &&
    !Array.isArray(source.distinguishingFeatures)
      ? (source.distinguishingFeatures as Record<string, unknown>)
      : undefined;

  for (const key of STAT_KEYS) {
    const score = toInt(stats[key] as number);
    const canonicalKey = STAT_KEY_MAP[key];
    const featureRaw = distinguishing?.[key];
    const feature =
      typeof featureRaw === "string" && featureRaw.length > 0 ? featureRaw : undefined;
    statistics[canonicalKey] = feature === undefined ? { score } : { score, distinguishingFeature: feature };
    if (score < 3 || score > 18) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Statistic ${key}=${score} is outside the usual 3–18 range and was not clamped.`,
          pointer("stats", key),
          {
            canonicalPath: pointer("statistics", canonicalKey, "score"),
            valueSummary: { kind: "scalar", typeName: "number", preview: String(score) },
          },
        ),
      );
    }
  }

  for (const [key, value] of Object.entries(stats)) {
    if (!(STAT_KEYS as readonly string[]).includes(key)) {
      preserveRaw(extensions, diagnostics, `stats.${key}`, value, `Unknown stats key ${key} preserved in extension.`);
    }
  }

  if (distinguishing) {
    for (const [key, value] of Object.entries(distinguishing)) {
      if (!(STAT_KEYS as readonly string[]).includes(key)) {
        preserveRaw(
          extensions,
          diagnostics,
          `distinguishingFeatures.${key}`,
          value,
          `Unknown distinguishingFeatures key ${key} preserved in extension.`,
        );
      }
    }
  } else if (source.distinguishingFeatures !== undefined) {
    preserveRaw(
      extensions,
      diagnostics,
      "distinguishingFeatures",
      source.distinguishingFeatures,
      "Malformed distinguishingFeatures preserved in extension.",
    );
  }

  // --- personal info ---
  const personalInfo =
    source.personalInfo !== null &&
    typeof source.personalInfo === "object" &&
    !Array.isArray(source.personalInfo)
      ? (source.personalInfo as Record<string, unknown>)
      : undefined;

  if (personalInfo) {
    if (typeof personalInfo.name === "string" && personalInfo.name.length > 0) {
      identity.name = personalInfo.name;
    }
    if (typeof personalInfo.employer === "string" && personalInfo.employer.length > 0) {
      biography.employer = personalInfo.employer;
    }
    if (typeof personalInfo.nationality === "string" && personalInfo.nationality.length > 0) {
      biography.nationality = personalInfo.nationality;
    }
    if (typeof personalInfo.sex === "string" && personalInfo.sex.length > 0) {
      biography.sex = personalInfo.sex;
    }

    const age = personalInfo.age;
    if (age !== undefined && age !== null && age !== "") {
      if (typeof age === "number" && Number.isInteger(age) && age >= 0) {
        biography.age = age;
      } else if (typeof age === "string" && /^\d+$/.test(age)) {
        biography.age = Number.parseInt(age, 10);
        diagnostics.push(
          information(
            catalogueDiagnosticCodes.safeCoercion,
            "Coerced digit-only personalInfo.age string to integer.",
            "/personalInfo/age",
            {
              canonicalPath: "/biography/age",
              valueSummary: { kind: "scalar", typeName: "string", preview: age },
            },
          ),
        );
      } else {
        preserveRaw(
          extensions,
          diagnostics,
          "personalInfo.age",
          age,
          "Non-digit personalInfo.age omitted from biography.age.",
        );
      }
    }

    const dob = personalInfo.dob;
    if (typeof dob === "string" && dob.trim().length > 0) {
      const trimmed = dob.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        biography.dateOfBirth = trimmed;
      } else {
        preserveRaw(
          extensions,
          diagnostics,
          "personalInfo.dob",
          dob,
          "Non-ISO personalInfo.dob omitted from biography.dateOfBirth.",
        );
        diagnostics.push(
          warning(
            catalogueDiagnosticCodes.lossDowngrade,
            "Known loss: non-ISO date of birth cannot populate biography.dateOfBirth.",
            "/personalInfo/dob",
            {
              canonicalPath: "/biography/dateOfBirth",
              localizationParameters: { knownLossId: "non-iso-dob-omitted" },
            },
          ),
        );
      }
    }

    for (const [key, value] of Object.entries(personalInfo)) {
      if (!PERSONAL_INFO_KEYS.has(key)) {
        preserveRaw(
          extensions,
          diagnostics,
          `personalInfo.${key}`,
          value,
          `Unknown personalInfo key ${key} preserved in extension.`,
        );
      }
    }
  } else if (source.personalInfo !== undefined) {
    preserveRaw(extensions, diagnostics, "personalInfo", source.personalInfo, "Malformed personalInfo preserved.");
  }

  // --- profession ---
  const professionKey = source.professionKey;
  const isCustomProfession = source.isCustomProfession === true;
  const customProfessionName =
    typeof source.customProfessionName === "string" ? source.customProfessionName : "";

  if (professionKey !== undefined) {
    extensions.workflow.professionKey = asJsonValue(professionKey);
  }
  extensions.workflow.isCustomProfession = isCustomProfession;
  extensions.workflow.customProfessionName = customProfessionName;

  const keyIsCustom = professionKey === "custom_profession";
  const treatAsCustom = keyIsCustom || isCustomProfession;
  if (keyIsCustom !== isCustomProfession && (professionKey !== null && professionKey !== undefined || isCustomProfession)) {
    diagnostics.push(
      warning(
        catalogueDiagnosticCodes.derivedConflict,
        "isCustomProfession disagrees with professionKey.",
        "/isCustomProfession",
      ),
    );
  }

  if (treatAsCustom) {
    const trimmed = customProfessionName.trim();
    if (trimmed.length > 0) {
      biography.profession = trimmed;
    } else {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.missingRecommended,
          "Custom profession name is empty; biography.profession omitted.",
          "/customProfessionName",
        ),
      );
    }
  } else if (typeof professionKey === "string" && professionKey.length > 0) {
    const mapped = PROFESSION_KEY_MAP[professionKey];
    if (mapped !== undefined) {
      biography.profession = mapped;
    } else {
      biography.profession = professionKey;
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Unknown professionKey ${professionKey}; used raw key as biography.profession.`,
          "/professionKey",
          { canonicalPath: "/biography/profession" },
        ),
      );
    }
  }

  // --- derived attributes / current ---
  const str = toInt(stats.STR as number);
  const con = toInt(stats.CON as number);
  const pow = toInt(stats.POW as number);
  const traumaticBackground =
    typeof source.traumaticBackground === "string" ? source.traumaticBackground : source.traumaticBackground === null ? null : undefined;
  const expected = deriveMaxima({
    str,
    con,
    pow,
    traumaticBackground,
    basePOW: source.basePOW,
  });

  const derivedAttributes =
    source.derivedAttributes !== null &&
    typeof source.derivedAttributes === "object" &&
    !Array.isArray(source.derivedAttributes)
      ? (source.derivedAttributes as Record<string, unknown>)
      : undefined;

  const derivedCurrent =
    source.derivedCurrent !== null &&
    typeof source.derivedCurrent === "object" &&
    !Array.isArray(source.derivedCurrent)
      ? (source.derivedCurrent as Record<string, unknown>)
      : undefined;

  function resolveMaximum(key: "HP" | "WP" | "SAN" | "BP", sourcePath: string): number {
    const explicit = derivedAttributes?.[key];
    if (isFiniteNumber(explicit)) {
      const value = toInt(explicit);
      if (value !== expected[key]) {
        diagnostics.push(
          warning(
            catalogueDiagnosticCodes.derivedConflict,
            `Explicit derivedAttributes.${key}=${value} conflicts with formula value ${expected[key]}; keeping explicit.`,
            sourcePath,
            {
              valueSummary: { kind: "scalar", typeName: "number", preview: String(value) },
            },
          ),
        );
      }
      return value;
    }
    return expected[key];
  }

  const hpMax = resolveMaximum("HP", "/derivedAttributes/HP");
  const wpMax = resolveMaximum("WP", "/derivedAttributes/WP");
  const sanMax = resolveMaximum("SAN", "/derivedAttributes/SAN");
  const bpBase = resolveMaximum("BP", "/derivedAttributes/BP");

  // GAC commonly exports derivedCurrent all-zeros while derivedAttributes hold formula
  // maxima (Caleb, Thorne, community sheets). Treat that whole block as uninitialized
  // rather than literal zero HP/WP/SAN (#40). Partial zeros (e.g. HP 0 with WP/SAN left)
  // stay explicit.
  const resourceKeys = ["HP", "WP", "SAN", "BP"] as const;
  const placeholderZeroCurrents =
    derivedCurrent !== undefined &&
    resourceKeys.every((key) => {
      if (!Object.prototype.hasOwnProperty.call(derivedCurrent, key)) {
        return false;
      }
      const explicit = derivedCurrent[key];
      return isFiniteNumber(explicit) && toInt(explicit) === 0;
    }) &&
    hpMax > 0 &&
    wpMax > 0 &&
    sanMax > 0;

  function resolveCurrent(
    key: "HP" | "WP" | "SAN" | "BP",
    maximum: number,
    sourcePath: string,
  ): number {
    if (placeholderZeroCurrents) {
      diagnostics.push(
        information(
          catalogueDiagnosticCodes.safeDefault,
          `derivedCurrent.${key}=0 in an all-zero derivedCurrent block; treating as uninitialized and defaulting to maximum ${maximum}.`,
          sourcePath,
        ),
      );
      return maximum;
    }
    if (derivedCurrent && Object.prototype.hasOwnProperty.call(derivedCurrent, key)) {
      const explicit = derivedCurrent[key];
      if (isFiniteNumber(explicit)) {
        const value = toInt(explicit);
        if (value > maximum) {
          diagnostics.push(
            warning(
              catalogueDiagnosticCodes.derivedConflict,
              `derivedCurrent.${key}=${value} exceeds maximum ${maximum}; value preserved without clamping.`,
              sourcePath,
              { valueSummary: { kind: "scalar", typeName: "number", preview: String(value) } },
            ),
          );
        }
        return value;
      }
      preserveRaw(
        extensions,
        diagnostics,
        `derivedCurrent.${key}`,
        explicit,
        `Malformed derivedCurrent.${key}; defaulting to maximum.`,
      );
      return maximum;
    }
    diagnostics.push(
      information(
        catalogueDiagnosticCodes.safeDefault,
        `Missing derivedCurrent.${key}; defaulted to maximum ${maximum}.`,
        sourcePath,
      ),
    );
    return maximum;
  }

  resources.hitPoints = { current: resolveCurrent("HP", hpMax, "/derivedCurrent/HP"), maximum: hpMax };
  resources.willpower = { current: resolveCurrent("WP", wpMax, "/derivedCurrent/WP"), maximum: wpMax };
  resources.sanity = { current: resolveCurrent("SAN", sanMax, "/derivedCurrent/SAN"), maximum: sanMax };
  resources.breakingPoint = {
    current: resolveCurrent("BP", bpBase, "/derivedCurrent/BP"),
    baseline: bpBase,
  };

  // --- workflow / identity / sheetBaseline ---
  for (const key of WORKFLOW_ROOT_KEYS) {
    if (source[key] !== undefined) {
      extensions.workflow[key] = asJsonValue(source[key]);
    }
  }
  if (Array.isArray(source.motivations)) {
    extensions.workflow.motivations = asJsonValue(source.motivations);
  }
  if (source.disorder !== undefined) {
    extensions.workflow.disorder = asJsonValue(source.disorder);
  }
  if (source.traumaticBackground !== undefined) {
    extensions.workflow.traumaticBackground = asJsonValue(source.traumaticBackground);
  }

  if (source.id !== undefined) {
    extensions.identity.id = asJsonValue(source.id);
  }
  if (source.createdDate !== undefined) {
    extensions.identity.createdDate = asJsonValue(source.createdDate);
  }
  if (source.meta !== undefined) {
    extensions.identity.meta = asJsonValue(source.meta);
  }
  if (source.version !== undefined) {
    extensions.identity.version = asJsonValue(source.version);
  }
  if (
    source.sheetBaseline !== null &&
    typeof source.sheetBaseline === "object" &&
    !Array.isArray(source.sheetBaseline)
  ) {
    extensions.sheetBaseline = asJsonValue(source.sheetBaseline) as Record<string, JsonValue>;
    diagnostics.push(
      information(
        catalogueDiagnosticCodes.safeNormalization,
        "sheetBaseline retained in extension; live root remains authoritative.",
        "/sheetBaseline",
      ),
    );
    const baseline = source.sheetBaseline as Record<string, unknown>;
    const livePersonal =
      source.personalInfo !== null && typeof source.personalInfo === "object" && !Array.isArray(source.personalInfo)
        ? (source.personalInfo as Record<string, unknown>)
        : undefined;
    const baselinePersonal =
      baseline.personalInfo !== null &&
      typeof baseline.personalInfo === "object" &&
      !Array.isArray(baseline.personalInfo)
        ? (baseline.personalInfo as Record<string, unknown>)
        : undefined;
    if (livePersonal && baselinePersonal) {
      for (const key of ["age", "name", "employer", "nationality", "sex", "dob"] as const) {
        if (
          Object.prototype.hasOwnProperty.call(livePersonal, key) &&
          Object.prototype.hasOwnProperty.call(baselinePersonal, key) &&
          JSON.stringify(livePersonal[key]) !== JSON.stringify(baselinePersonal[key])
        ) {
          diagnostics.push(
            information(
              catalogueDiagnosticCodes.derivedConflict,
              `sheetBaseline.personalInfo.${key} differs from live personalInfo.${key}; live root wins.`,
              pointer("sheetBaseline", "personalInfo", key),
            ),
          );
        }
      }
    }
  } else if (source.sheetBaseline !== undefined) {
    preserveRaw(extensions, diagnostics, "sheetBaseline", source.sheetBaseline, "Malformed sheetBaseline preserved.");
  }

  if (source.basePOW !== undefined) {
    if (
      source.traumaticBackground === "captivity" &&
      (source.basePOW === null || !isFiniteNumber(source.basePOW))
    ) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.derivedConflict,
          "captivity traumatic background lacks coherent basePOW.",
          "/basePOW",
        ),
      );
    }
  }

  // --- psychology ---
  const motivations: AgentSnapshot["psychology"]["motivations"] = [];
  if (Array.isArray(source.motivations)) {
    for (const [index, entry] of source.motivations.entries()) {
      if (typeof entry === "string" && entry.length > 0) {
        motivations.push({
          id: createId(),
          statement: entry,
          crossedOut: false,
        });
      } else if (entry !== "" && entry !== undefined) {
        preserveRaw(
          extensions,
          diagnostics,
          `motivations[${index}]`,
          entry,
          "Non-string motivation entry preserved in extension.",
        );
      }
    }
    if (motivations.length > 0) {
      diagnostics.push(
        information(
          catalogueDiagnosticCodes.lossDowngrade,
          "Known loss: motivation crossedOut defaults to false.",
          "/motivations",
          {
            canonicalPath: "/psychology/motivations",
            localizationParameters: { knownLossId: "motivation-crossed-out-default-false" },
          },
        ),
      );
    }
  } else if (source.motivations !== undefined) {
    preserveRaw(extensions, diagnostics, "motivations", source.motivations, "Malformed motivations preserved.");
  }

  const disorders: AgentSnapshot["psychology"]["disorders"] = [];
  if (typeof source.disorder === "string" && source.disorder.length > 0) {
    disorders.push({ id: createId(), name: source.disorder, cured: false });
    diagnostics.push(
      information(
        catalogueDiagnosticCodes.lossDowngrade,
        "Known loss: disorder cured defaults to false.",
        "/disorder",
        {
          canonicalPath: "/psychology/disorders",
          localizationParameters: { knownLossId: "disorder-cured-default-false" },
        },
      ),
    );
  }

  const adaptations: AgentSnapshot["psychology"]["adaptations"] = [];
  if (Array.isArray(source.adaptations)) {
    for (const entry of source.adaptations) {
      if (typeof entry !== "string" || entry.length === 0) {
        continue;
      }
      const normalized = normalizeAdaptationLabel(entry);
      if (normalized === "adapted to violence") {
        adaptations.push({ id: createId(), kind: "violence", adapted: true });
      } else if (normalized === "adapted to helplessness") {
        adaptations.push({ id: createId(), kind: "helplessness", adapted: true });
      } else {
        adaptations.push({ id: createId(), kind: "other", label: entry, adapted: true });
      }
    }
    if (adaptations.length > 0) {
      diagnostics.push(
        information(
          catalogueDiagnosticCodes.lossDowngrade,
          "Known loss: adaptation incidentMarks are omitted; adapted state preserved without invented history.",
          "/adaptations",
          {
            canonicalPath: "/psychology/adaptations",
            localizationParameters: { knownLossId: "adaptation-incident-marks-omitted" },
          },
        ),
      );
    }
  } else if (source.adaptations !== undefined) {
    preserveRaw(extensions, diagnostics, "adaptations", source.adaptations, "Malformed adaptations preserved.");
  }

  let traumaticBackgroundOut: string | undefined;
  if (typeof source.traumaticBackground === "string" && source.traumaticBackground.length > 0) {
    traumaticBackgroundOut = source.traumaticBackground;
    if (!KNOWN_TRAUMATIC_BACKGROUNDS.has(source.traumaticBackground)) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Unknown traumaticBackground ${source.traumaticBackground} preserved.`,
          "/traumaticBackground",
        ),
      );
    }
  }

  // --- bonds ---
  const bonds: AgentSnapshot["relationships"]["bonds"] = [];
  if (Array.isArray(source.bonds)) {
    if (source.bonds.length > 6) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Bond count ${source.bonds.length} exceeds creator sharing limit of 6; all imported.`,
          "/bonds",
        ),
      );
    }
    const cha = toInt(stats.CHA as number);
    for (const [index, entry] of source.bonds.entries()) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        preserveRaw(extensions, diagnostics, `bonds[${index}]`, entry, "Malformed bond preserved.");
        continue;
      }
      const bond = entry as Record<string, unknown>;
      const description = typeof bond.description === "string" ? bond.description : "";
      const trimmed = description.trim();
      let name = trimmed;
      if (name.length === 0) {
        name = `Bond ${index + 1}`;
        diagnostics.push(
          warning(
            catalogueDiagnosticCodes.missingRecommended,
            "Empty bond description; used placeholder name.",
            pointer("bonds", index, "description"),
          ),
        );
      }
      let score = 0;
      if (isFiniteNumber(bond.score)) {
        score = toInt(bond.score);
        if (score > cha) {
          diagnostics.push(
            warning(
              catalogueDiagnosticCodes.derivedConflict,
              `Bond score ${score} exceeds CHA ${cha}.`,
              pointer("bonds", index, "score"),
            ),
          );
        }
      } else {
        preserveRaw(
          extensions,
          diagnostics,
          `bonds[${index}].score`,
          bond.score,
          "Non-numeric bond score defaulted to 0.",
        );
      }
      bonds.push({
        id: createId(),
        name,
        score,
        damagedSinceLastHomeScene: false,
      });
    }
    if (bonds.length > 0) {
      diagnostics.push(
        information(
          catalogueDiagnosticCodes.lossDowngrade,
          "Known loss: bond damage defaults to false; GAC bond description becomes canonical name.",
          "/bonds",
          {
            canonicalPath: "/relationships/bonds",
            localizationParameters: { knownLossId: "bond-damage-default-false" },
          },
        ),
      );
      diagnostics.push(
        information(
          catalogueDiagnosticCodes.lossDowngrade,
          "Known loss: GAC bond description becomes canonical bond name.",
          "/bonds",
          {
            canonicalPath: "/relationships/bonds",
            localizationParameters: { knownLossId: "bond-description-becomes-name" },
          },
        ),
      );
    }
  } else if (source.bonds !== undefined) {
    preserveRaw(extensions, diagnostics, "bonds", source.bonds, "Malformed bonds preserved.");
  }

  // --- items / notes ---
  const gear: AgentSnapshot["inventory"]["gear"] = [];
  if (Array.isArray(source.items)) {
    if (source.items.length > 50) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Item count ${source.items.length} exceeds creator sharing limit of 50; all imported as gear.`,
          "/items",
        ),
      );
    }
    for (const [index, entry] of source.items.entries()) {
      if (typeof entry !== "string") {
        preserveRaw(extensions, diagnostics, `items[${index}]`, entry, "Non-string item preserved.");
        continue;
      }
      let name = entry;
      if (name.length === 0) {
        // Canonical gear.name requires min length 1; keep the exact empty in raw.
        extensions.raw[`items[${index}]`] = "";
        name = "(unnamed item)";
        diagnostics.push(
          warning(
            catalogueDiagnosticCodes.missingRecommended,
            "Empty item string preserved in extension; canonical gear uses placeholder name.",
            pointer("items", index),
          ),
        );
      }
      gear.push({ id: createId(), name, equipped: false });
    }
    if (source.items.length > 0) {
      diagnostics.push(
        information(
          catalogueDiagnosticCodes.lossDowngrade,
          "Known loss: free-text items import only as gear.",
          "/items",
          {
            canonicalPath: "/inventory/gear",
            localizationParameters: { knownLossId: "items-are-gear-only" },
          },
        ),
      );
    }
  } else if (source.items !== undefined) {
    preserveRaw(extensions, diagnostics, "items", source.items, "Malformed items preserved.");
  }

  const playerNotes: AgentSnapshot["notes"]["player"] = [];
  if (typeof source.notes === "string" && source.notes.length > 0) {
    playerNotes.push({ format: "plain", content: source.notes });
    diagnostics.push(
      information(
        catalogueDiagnosticCodes.lossDowngrade,
        "Known loss: GAC notes map only to notes.player; notes.handler stays empty.",
        "/notes",
        {
          canonicalPath: "/notes/handler",
          localizationParameters: { knownLossId: "no-handler-notes" },
        },
      ),
    );
  }

  // --- skills ---
  const standard: Partial<Record<StandardSkillId, { proficiency: number; failureMarked: boolean }>> = {};
  const custom: AgentSnapshot["skills"]["custom"] = [];
  const failMarks = Array.isArray(source.skillFailMarks)
    ? source.skillFailMarks.filter((id): id is string => typeof id === "string")
    : [];
  const failMarkSet = new Set(failMarks);
  const resolvedFailMarks = new Set<string>();
  const skillInstanceIds = new Set<string>();
  const typedSeen = new Map<string, number>();

  for (const [index, entry] of (source.skills as unknown[]).entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      preserveRaw(extensions, diagnostics, `skills[${index}]`, entry, "Malformed skill entry preserved.");
      continue;
    }
    const skill = entry as Record<string, unknown>;
    const key = typeof skill.key === "string" ? skill.key : "";
    const instanceId = typeof skill.instanceId === "string" ? skill.instanceId : `skills[${index}]`;
    if (skillInstanceIds.has(instanceId)) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.duplicateIdentity,
          `Duplicate skill instanceId ${instanceId}.`,
          pointer("skills", index, "instanceId"),
        ),
      );
    }
    skillInstanceIds.add(instanceId);

    if (!isFiniteNumber(skill.value)) {
      preserveRaw(
        extensions,
        diagnostics,
        `skills[${index}]`,
        skill,
        `Skill ${instanceId} has non-finite value and was not imported.`,
      );
      continue;
    }
    const proficiency = toInt(skill.value);
    if (proficiency < 0 || proficiency > 99) {
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.safeNormalization,
          `Skill proficiency ${proficiency} is outside 0–99 and was not clamped.`,
          pointer("skills", index, "value"),
          { valueSummary: { kind: "scalar", typeName: "number", preview: String(proficiency) } },
        ),
      );
    }

    const typeName = skill.typeName;
    const typeNameText = typeof typeName === "string" ? typeName : "";
    const trimmedType = typeNameText.trim();
    const failureMarked = failMarkSet.has(instanceId);
    if (failureMarked) {
      resolvedFailMarks.add(instanceId);
    }

    extensions.skillConstruction[instanceId] = asJsonValue({
      key,
      typeName: typeName ?? null,
      baseValueFromProfession: skill.baseValueFromProfession ?? null,
      increases: skill.increases ?? null,
      isProfessional: skill.isProfessional ?? null,
      isChoiceSkill: skill.isChoiceSkill ?? null,
      slotId: skill.slotId ?? null,
    });

    if (TYPED_SKILL_FAMILIES.has(key)) {
      const meaningful = trimmedType.length > 0 || proficiency !== 0 || failureMarked;
      if (!meaningful) {
        continue;
      }
      if (trimmedType.length > 0) {
        const dupKey = `${key}\0${trimmedType.toLowerCase()}`;
        const prior = typedSeen.get(dupKey) ?? 0;
        typedSeen.set(dupKey, prior + 1);
        if (prior > 0) {
          diagnostics.push(
            warning(
              catalogueDiagnosticCodes.ambiguousIdentity,
              `Duplicate custom skill (${key}, ${trimmedType}).`,
              pointer("skills", index),
            ),
          );
        }
      }
      const label = trimmedType.length > 0 ? trimmedType : key;
      custom.push({
        id: createId(),
        group: key,
        label,
        proficiency,
        failureMarked,
      });
      continue;
    }

    if (key === "unarmed_combat") {
      custom.push({
        id: createId(),
        group: "unarmed_combat",
        label: "Unarmed Combat",
        proficiency,
        failureMarked,
      });
      diagnostics.push(
        warning(
          catalogueDiagnosticCodes.lossDowngrade,
          "Known loss: unarmed_combat is not a canonical standard skill; imported as custom.",
          pointer("skills", index),
          {
            canonicalPath: "/skills/custom",
            localizationParameters: { knownLossId: "unarmed-combat-not-standard" },
          },
        ),
      );
      continue;
    }

    const standardId = SKILL_KEY_MAP[key];
    if (standardId !== undefined) {
      standard[standardId] = { proficiency, failureMarked };
      continue;
    }

    if (key.length === 0) {
      preserveRaw(extensions, diagnostics, `skills[${index}]`, skill, "Skill without key preserved.");
      continue;
    }

    custom.push({
      id: createId(),
      group: key,
      label: trimmedType.length > 0 ? trimmedType : key,
      proficiency,
      failureMarked,
    });
    diagnostics.push(
      warning(
        catalogueDiagnosticCodes.safeNormalization,
        `Unknown skill key ${key} imported as custom skill.`,
        pointer("skills", index, "key"),
      ),
    );
  }

  const unresolvedFailMarks = failMarks.filter((mark) => !resolvedFailMarks.has(mark));
  if (unresolvedFailMarks.length > 0) {
    extensions.raw.skillFailMarks = asJsonValue(unresolvedFailMarks);
    diagnostics.push(
      warning(
        catalogueDiagnosticCodes.staleState,
        `Unresolved skillFailMarks preserved in extension: ${unresolvedFailMarks.join(", ")}.`,
        "/skillFailMarks",
      ),
    );
  }

  // --- unknown roots ---
  for (const [key, value] of Object.entries(source)) {
    if (!KNOWN_ROOT_KEYS.has(key)) {
      preserveRaw(extensions, diagnostics, key, value, `Unknown root key ${key} preserved in extension.`);
    }
  }

  const recordId =
    source.id !== null && source.id !== undefined && String(source.id).length > 0
      ? String(source.id)
      : undefined;

  const snapshotInput: AgentSnapshot = parseAgentSnapshot({
    schemaVersion: "1.0.0",
    agentId: createId(),
    identity,
    biography,
    statistics,
    resources,
    skills: {
      standard,
      custom,
      specialTraining: [],
    },
    relationships: { bonds },
    psychology: {
      motivations,
      disorders,
      adaptations,
      ...(traumaticBackgroundOut !== undefined ? { traumaticBackground: traumaticBackgroundOut } : {}),
    },
    inventory: {
      weapons: [],
      armor: [],
      gear,
      rituals: [],
      tomes: [],
    },
    notes: {
      player: playerNotes,
      handler: [],
    },
    campaignState: {},
    provenance: {
      adapter: { id: ADAPTER_ID, version: adapterVersion },
      source: {
        format: SOURCE_FORMAT,
        version: SOURCE_VERSION,
        ...(recordId !== undefined ? { recordId } : {}),
      },
      ...(options.capturedAt !== undefined ? { capturedAt: options.capturedAt } : {}),
      contentHash,
    },
    extensions: {
      greenAgentCreator: {
        workflow: extensions.workflow,
        skillConstruction: extensions.skillConstruction,
        sheetBaseline: extensions.sheetBaseline,
        identity: extensions.identity,
        raw: extensions.raw,
      },
    },
  });

  // Informational known-loss defaults (emitted once per successful import)
  diagnostics.push(
    information(
      catalogueDiagnosticCodes.lossDowngrade,
      "Known loss: creator-local ids are not durable canonical identities.",
      "/id",
      {
        canonicalPath: "/agentId",
        localizationParameters: { knownLossId: "creator-ids-not-canonical" },
      },
    ),
  );
  diagnostics.push(
    information(
      catalogueDiagnosticCodes.lossDowngrade,
      "Known loss: GAC has no special-training model; skills.specialTraining is empty.",
      "/skills",
      {
        canonicalPath: "/skills/specialTraining",
        localizationParameters: { knownLossId: "no-special-training" },
      },
    ),
  );
  diagnostics.push(
    information(
      catalogueDiagnosticCodes.lossDowngrade,
      "Known loss: structured weapons/armor/rituals/tomes have no GAC source.",
      "/items",
      {
        canonicalPath: "/inventory/weapons",
        localizationParameters: { knownLossId: "no-structured-combat-gear-or-mythos-items" },
      },
    ),
  );
  diagnostics.push(
    information(
      catalogueDiagnosticCodes.lossDowngrade,
      "Known loss: aliases, education, and physical description are absent from GAC.",
      "/personalInfo",
      {
        canonicalPath: "/identity/aliases",
        localizationParameters: { knownLossId: "no-aliases-education-physical-description" },
      },
    ),
  );
  diagnostics.push(
    information(
      catalogueDiagnosticCodes.lossDowngrade,
      "Known loss: wounds, exhausted, and firstAidAttempted are absent from GAC.",
      "/derivedCurrent",
      {
        canonicalPath: "/resources/wounds",
        localizationParameters: { knownLossId: "no-wounds-exhausted-first-aid" },
      },
    ),
  );
  diagnostics.push(
    information(
      catalogueDiagnosticCodes.lossDowngrade,
      "Known loss: Impossible Landscapes campaign state is absent from GAC.",
      "",
      {
        canonicalPath: "/campaignState/impossibleLandscapes",
        localizationParameters: { knownLossId: "no-impossible-landscapes" },
      },
    ),
  );
  diagnostics.push(
    information(
      catalogueDiagnosticCodes.lossDowngrade,
      "Known loss: regenerated entity ids prevent byte-identical round-trip.",
      "/skills",
      {
        canonicalPath: "/skills/custom",
        localizationParameters: { knownLossId: "regenerated-entity-ids-break-byte-round-trip" },
      },
    ),
  );

  return createOperationResult({
    diagnostics,
    requiredResolutions: [],
    output: snapshotInput,
  });
}
