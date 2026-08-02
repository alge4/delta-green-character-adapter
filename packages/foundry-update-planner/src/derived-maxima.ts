import {
  fingerprintDiagnostic,
  type AdapterDiagnostic,
} from "@delta-green-character-adapter/adapter-core";
import type { JsonValue } from "@delta-green-character-adapter/character-model";

import { catalogueDiagnosticCodes, diagnostic } from "./diagnostics.js";
import { optionalScope, pushEntry, type DraftPlanEntry } from "./entries.js";
import type { UpdateMode } from "./schemas.js";
import { asJsonValue, deepEqual, isRecord, pointer, type UnknownRecord } from "./util.js";

type FormulaMaxima = {
  readonly healthMax: number;
  readonly willpowerMax: number;
  readonly sanityMax: number;
  readonly breakingPoint: number;
};

function statValue(statistics: UnknownRecord, key: string): number {
  const entry = statistics[key];
  return isRecord(entry) && typeof entry.value === "number" ? entry.value : 10;
}

/** Delta Green formula maxima from Foundry statistic scores (same as export). */
export function formulaMaximaFromStatistics(system: UnknownRecord): FormulaMaxima {
  const statistics = isRecord(system.statistics) ? system.statistics : {};
  const strength = statValue(statistics, "str");
  const constitution = statValue(statistics, "con");
  const power = statValue(statistics, "pow");
  const healthMax = Math.ceil((strength + constitution) / 2);
  const willpowerMax = power;
  const sanityMax = power * 5;
  return {
    healthMax,
    willpowerMax,
    sanityMax,
    breakingPoint: sanityMax - power,
  };
}

function numberAt(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" ? value : undefined;
}

/**
 * When imported statistics change derived maxima, mutable currents stay preserved and
 * diagnostics offer keep-target / imported / corrected formula values (#7).
 */
export function planDerivedMaximaConflicts(
  entries: DraftPlanEntry[],
  target: unknown,
  desired: unknown,
  ctx: {
    readonly createId: () => string;
    readonly mode: UpdateMode;
    readonly blankTarget: boolean;
    readonly mutableFresh: boolean;
    readonly bound: boolean;
    readonly callerIsGm: boolean;
    readonly bindEntryId?: string;
  },
  diagnostics: AdapterDiagnostic[],
): void {
  if (ctx.blankTarget || ctx.mode === "synchronize") {
    return;
  }
  const targetSystem =
    isRecord(target) && isRecord(target.system) ? (target.system as UnknownRecord) : {};
  const desiredSystem =
    isRecord(desired) && isRecord(desired.system) ? (desired.system as UnknownRecord) : {};
  const beforeFormula = formulaMaximaFromStatistics(targetSystem);
  const afterFormula = formulaMaximaFromStatistics(desiredSystem);
  if (
    beforeFormula.healthMax === afterFormula.healthMax &&
    beforeFormula.willpowerMax === afterFormula.willpowerMax &&
    beforeFormula.sanityMax === afterFormula.sanityMax &&
    beforeFormula.breakingPoint === afterFormula.breakingPoint
  ) {
    return;
  }

  const deps = ctx.bindEntryId !== undefined ? [ctx.bindEntryId] : [];
  const targetHealth = isRecord(targetSystem.health) ? targetSystem.health : {};
  const desiredHealth = isRecord(desiredSystem.health) ? desiredSystem.health : {};
  const targetWp = isRecord(targetSystem.wp) ? targetSystem.wp : {};
  const desiredWp = isRecord(desiredSystem.wp) ? desiredSystem.wp : {};
  const targetSanity = isRecord(targetSystem.sanity) ? targetSystem.sanity : {};
  const desiredSanity = isRecord(desiredSystem.sanity) ? desiredSystem.sanity : {};

  const conflicts: Array<{
    path: string;
    beforeValue: unknown;
    importedValue: unknown;
    correctedValue: number;
  }> = [
    {
      path: pointer("system", "health", "max"),
      beforeValue: numberAt(targetHealth, "max"),
      importedValue: numberAt(desiredHealth, "max"),
      correctedValue: afterFormula.healthMax,
    },
    {
      path: pointer("system", "health", "value"),
      beforeValue: numberAt(targetHealth, "value"),
      importedValue: numberAt(desiredHealth, "value"),
      correctedValue: Math.min(numberAt(targetHealth, "value") ?? afterFormula.healthMax, afterFormula.healthMax),
    },
    {
      path: pointer("system", "wp", "max"),
      beforeValue: numberAt(targetWp, "max"),
      importedValue: numberAt(desiredWp, "max"),
      correctedValue: afterFormula.willpowerMax,
    },
    {
      path: pointer("system", "wp", "value"),
      beforeValue: numberAt(targetWp, "value"),
      importedValue: numberAt(desiredWp, "value"),
      correctedValue: Math.min(
        numberAt(targetWp, "value") ?? afterFormula.willpowerMax,
        afterFormula.willpowerMax,
      ),
    },
    {
      path: pointer("system", "sanity", "value"),
      beforeValue: numberAt(targetSanity, "value"),
      importedValue: numberAt(desiredSanity, "value"),
      correctedValue: Math.min(
        numberAt(targetSanity, "value") ?? afterFormula.sanityMax,
        afterFormula.sanityMax,
      ),
    },
    {
      path: pointer("system", "sanity", "currentBreakingPoint"),
      beforeValue: numberAt(targetSanity, "currentBreakingPoint"),
      importedValue: numberAt(desiredSanity, "currentBreakingPoint"),
      correctedValue: afterFormula.breakingPoint,
    },
  ];

  for (const conflict of conflicts) {
    if (
      conflict.beforeValue === undefined ||
      deepEqual(conflict.beforeValue, conflict.correctedValue)
    ) {
      continue;
    }
    const already = entries.some((entry) => entry.path === conflict.path);
    if (!already) {
      pushEntry(entries, {
        id: ctx.createId(),
        operation: "preserve",
        path: conflict.path,
        fieldClass: conflict.path.endsWith("/max") ? "profile" : "mutable",
        beforeValue: conflict.beforeValue,
        proposedValue: conflict.importedValue,
        mode: ctx.mode,
        blankTarget: ctx.blankTarget,
        mutableFresh: ctx.mutableFresh,
        bound: ctx.bound,
        removalEligible: false,
        callerIsGm: ctx.callerIsGm,
        ...optionalScope("mutableResources"),
        dependencies: deps,
      });
    }

    const diag = diagnostic({
      code: catalogueDiagnosticCodes.derivedConflict,
      severity: "warning",
      message: `Imported statistics change derived maxima; ${conflict.path} is preserved and offers keep-target, imported, or corrected formula values.`,
      targetPath: conflict.path,
      remediations: [
        { action: "keepTarget", label: "Keep target value" },
        {
          action: "replaceValue",
          label: "Use imported value",
          parameters: {
            value: (conflict.importedValue === undefined
              ? null
              : asJsonValue(conflict.importedValue)) as JsonValue,
          },
        },
        {
          action: "useDefault",
          label: "Use corrected formula value",
          parameters: { value: conflict.correctedValue },
        },
      ],
    });
    diagnostics.push(diag);

    const entry = entries.find((row) => row.path === conflict.path);
    if (entry !== undefined) {
      const fingerprints = entry.diagnosticFingerprints ?? [];
      entry.diagnosticFingerprints = [...fingerprints, fingerprintDiagnostic(diag)];
    }
  }
}
