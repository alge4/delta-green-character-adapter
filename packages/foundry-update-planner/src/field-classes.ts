import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";

import type { UpdateFieldClass, UpdateScope } from "./schemas.js";

export type ClassifiedPath = {
  readonly fieldClass: UpdateFieldClass;
  readonly scope?: UpdateScope;
  /** When true, an absent imported value means "no change" rather than clear. */
  readonly optionalAbsenceIsNoop: boolean;
};

const MUTABLE_ITEM_FIELDS: ReadonlySet<string> = new Set([
  "score",
  "hasBeenDamagedSinceLastHomeScene",
  "ammo",
  "equipped",
  "crossedOut",
  "disorderCured",
]);

const HANDLER_ITEM_FIELDS: ReadonlySet<string> = new Set(["handlerNotes"]);

const PROFILE_ITEM_FIELDS: ReadonlySet<string> = new Set([
  "description",
  "relationship",
  "skill",
  "skillModifier",
  "customSkillTarget",
  "range",
  "damage",
  "armorPiercing",
  "lethality",
  "isLethal",
  "killRadius",
  "expense",
  "protection",
  "language",
  "studyTime",
  "unnaturalSkillIncrease",
  "occultSkillIncrease",
  "activationCosts",
  "activationTime",
  "complexity",
  "revealed",
  "disorder",
  "sanity",
  "learnedSanity",
]);

/**
 * Classify an Actor/Item JSON Pointer for Update Plan selection defaults (#7/#10).
 */
export function classifyPath(path: string): ClassifiedPath {
  if (
    path === "/_id" ||
    path === "/_stats" ||
    path === "/img" ||
    path === "/effects" ||
    path === "/folder" ||
    path === "/sort" ||
    path === "/ownership" ||
    path === "/prototypeToken" ||
    path.startsWith("/prototypeToken/") ||
    path === "/system/settings" ||
    path.startsWith("/system/settings/")
  ) {
    return { fieldClass: "foundryOwned", optionalAbsenceIsNoop: true };
  }

  if (path.startsWith("/flags/") && !path.startsWith(`/flags/${ADAPTER_FLAG_NAMESPACE}`)) {
    return { fieldClass: "foundryOwned", optionalAbsenceIsNoop: true };
  }

  if (path.startsWith(`/flags/${ADAPTER_FLAG_NAMESPACE}`)) {
    return { fieldClass: "adapterOwned", scope: "biography", optionalAbsenceIsNoop: false };
  }

  if (path === "/name") {
    return { fieldClass: "profile", scope: "biography", optionalAbsenceIsNoop: false };
  }

  if (path.startsWith("/system/biography")) {
    return { fieldClass: "profile", scope: "biography", optionalAbsenceIsNoop: true };
  }

  if (path === "/system/physical/description") {
    return { fieldClass: "profile", scope: "biography", optionalAbsenceIsNoop: true };
  }

  if (/^\/system\/statistics\/[^/]+\/(value|distinguishing_feature)$/.test(path)) {
    return { fieldClass: "profile", scope: "biography", optionalAbsenceIsNoop: false };
  }

  if (/^\/system\/skills\/[^/]+\/proficiency$/.test(path) || /^\/system\/skills\/[^/]+\/label$/.test(path)) {
    return { fieldClass: "profile", scope: "skills", optionalAbsenceIsNoop: false };
  }

  if (/^\/system\/skills\/[^/]+\/failure$/.test(path)) {
    return { fieldClass: "mutable", scope: "skills", optionalAbsenceIsNoop: false };
  }

  if (
    /^\/system\/typedSkills\/[^/]+\/(proficiency|label|group)$/.test(path) ||
    /^\/system\/specialTraining\/\d+\/(name|attribute)$/.test(path)
  ) {
    return { fieldClass: "profile", scope: "skills", optionalAbsenceIsNoop: false };
  }

  if (/^\/system\/typedSkills\/[^/]+\/failure$/.test(path)) {
    return { fieldClass: "mutable", scope: "skills", optionalAbsenceIsNoop: false };
  }

  if (
    path === "/system/health/value" ||
    path === "/system/wp/value" ||
    path === "/system/sanity/value" ||
    path === "/system/sanity/currentBreakingPoint" ||
    path === "/system/physical/wounds" ||
    path === "/system/physical/firstAidAttempted" ||
    path === "/system/physical/exhausted" ||
    path === "/system/physical/exhaustedPenalty" ||
    path.startsWith("/system/sanity/adaptations/") ||
    path.startsWith("/system/corruption/")
  ) {
    return { fieldClass: "mutable", scope: "mutableResources", optionalAbsenceIsNoop: true };
  }

  if (path === "/system/health/max" || path === "/system/wp/max" || path === "/system/health/min" || path === "/system/wp/min") {
    return { fieldClass: "profile", scope: "mutableResources", optionalAbsenceIsNoop: false };
  }

  const itemMatch = path.match(/^\/items\/([^/]+)(?:\/(.*))?$/);
  if (itemMatch) {
    const rest = itemMatch[2] ?? "";
    if (rest === "" || rest === "name" || rest === "type") {
      return { fieldClass: "profile", optionalAbsenceIsNoop: false };
    }
    if (rest.startsWith("flags/deltagreen")) {
      return { fieldClass: "systemManaged", scope: "weapons", optionalAbsenceIsNoop: true };
    }
    if (rest.startsWith("flags/") && !rest.startsWith("flags/deltaGreenCharacterAdapter")) {
      return { fieldClass: "foundryOwned", optionalAbsenceIsNoop: true };
    }
    const field = rest.replace(/^system\//, "").split("/")[0] ?? "";
    if (HANDLER_ITEM_FIELDS.has(field)) {
      return { fieldClass: "handlerOnly", optionalAbsenceIsNoop: true };
    }
    if (MUTABLE_ITEM_FIELDS.has(field)) {
      return { fieldClass: "mutable", optionalAbsenceIsNoop: true };
    }
    if (PROFILE_ITEM_FIELDS.has(field) || rest.startsWith("system/")) {
      return { fieldClass: "profile", optionalAbsenceIsNoop: true };
    }
  }

  return { fieldClass: "foundryOwned", optionalAbsenceIsNoop: true };
}

export function scopeForItemType(itemType: string): UpdateScope | undefined {
  switch (itemType) {
    case "bond":
      return "bonds";
    case "motivation":
      return "motivations";
    case "weapon":
      return "weapons";
    case "armor":
      return "armour";
    case "gear":
      return "gear";
    case "ritual":
      return "rituals";
    case "tome":
      return "tomes";
    default:
      return undefined;
  }
}

export function defaultSelected(
  fieldClass: UpdateFieldClass,
  operation: "bind" | "add" | "update" | "preserve" | "clear" | "remove",
  mode: "merge" | "replace" | "synchronize",
  options: {
    readonly blankTarget: boolean;
    readonly mutableFresh: boolean;
    readonly bound: boolean;
    readonly removalEligible: boolean;
    readonly callerIsGm: boolean;
  },
): { readonly selected: boolean; readonly reason: string } {
  if (fieldClass === "foundryOwned") {
    return { selected: false, reason: "Foundry-owned state is never mutated by the planner." };
  }
  if (operation === "preserve") {
    return { selected: false, reason: "Value is preserved; no write is proposed." };
  }
  if (operation === "bind") {
    return { selected: false, reason: "Actor Binding requires explicit confirmation." };
  }
  if (operation === "clear") {
    return { selected: false, reason: "Explicit clears are warned and deselected by default." };
  }
  if (fieldClass === "handlerOnly" && !options.callerIsGm) {
    return { selected: false, reason: "Handler-only content requires a GM." };
  }
  if (fieldClass === "systemManaged" && operation === "remove") {
    return { selected: false, reason: "System-managed entries such as Unarmed Attack stay protected." };
  }
  if (operation === "remove") {
    if (mode === "merge") {
      return { selected: false, reason: "Merge never deletes." };
    }
    if (!options.bound) {
      return { selected: false, reason: "Destructive updates require an established Actor Binding." };
    }
    if (!options.removalEligible) {
      return {
        selected: false,
        reason: "Unbound or uncertain ownership stays protected until individually confirmed.",
      };
    }
    if (fieldClass === "mutable" && mode === "replace") {
      return { selected: false, reason: "Replace protects mutable campaign state." };
    }
    return { selected: true, reason: "Replace/Synchronize proposes reviewed removals in complete scopes." };
  }
  if (fieldClass === "mutable") {
    if (options.blankTarget && mode === "merge") {
      return { selected: true, reason: "Blank fingerprint initialization replaces placeholder defaults." };
    }
    if (mode === "synchronize") {
      if (options.mutableFresh) {
        return { selected: true, reason: "Synchronize selects fresher mutable campaign state by default." };
      }
      return {
        selected: false,
        reason: "Stale or unknown mutable provenance leaves campaign-state changes deselected.",
      };
    }
    return { selected: false, reason: "Mutable campaign state is preserved by default on Merge/Replace." };
  }
  if (fieldClass === "profile" || fieldClass === "adapterOwned" || fieldClass === "handlerOnly") {
    if (operation === "add") {
      return { selected: true, reason: "Unmatched imported entries are selected additions by default." };
    }
    return { selected: true, reason: "Profile and capability changes are selected by default." };
  }
  return { selected: false, reason: "No default selection." };
}
