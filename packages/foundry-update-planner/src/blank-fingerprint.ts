import {
  SYSTEM_FLAG_NAMESPACE,
  UNARMED_ATTACK_SYSTEM_NAME,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";

import { contentHash, isRecord, type UnknownRecord } from "./util.js";

/**
 * Relevant untouched-default fingerprint of
 * `fixtures/foundry/14.365-deltagreen-1.7.0/fvtt-Actor-blank-GZGftVGSKSRNSREr.json`
 * (#7 supplemental). Baked so the planner stays pure (no filesystem I/O).
 */
export const BLANK_UNTOUCHED_FINGERPRINT =
  "sha256:f4e86fbeb7819c20d8039719648c5c0ef66878eb05f3a96e9504f47f410ec691" as const;

/**
 * Relevant untouched-default slice for blank-Actor recognition (#7 supplemental).
 * Ignores Foundry document identity, ownership, tokens, timestamps, presentation,
 * and adapter-owned binding/audit flags.
 */
export function untouchedDefaultSlice(actor: unknown): unknown {
  if (!isRecord(actor)) {
    return null;
  }
  const system = isRecord(actor.system) ? actor.system : {};
  const items = Array.isArray(actor.items) ? actor.items : [];

  const normalizedItems = items
    .filter(isRecord)
    .map((item) => {
      const itemFlags = isRecord(item.flags) ? item.flags : {};
      const systemFlags = isRecord(itemFlags[SYSTEM_FLAG_NAMESPACE])
        ? (itemFlags[SYSTEM_FLAG_NAMESPACE] as UnknownRecord)
        : {};
      return {
        name: typeof item.name === "string" ? item.name : "",
        type: typeof item.type === "string" ? item.type : "",
        system: isRecord(item.system) ? item.system : {},
        systemOwned:
          systemFlags.SystemName === UNARMED_ATTACK_SYSTEM_NAME && systemFlags.AutoAdded === true,
      };
    })
    .sort((left, right) => `${left.type}/${left.name}`.localeCompare(`${right.type}/${right.name}`));

  return {
    type: actor.type ?? null,
    system: {
      health: system.health ?? null,
      wp: system.wp ?? null,
      statistics: system.statistics ?? null,
      skills: system.skills ?? null,
      typedSkills: system.typedSkills ?? null,
      specialTraining: system.specialTraining ?? null,
      schemaVersion: system.schemaVersion ?? null,
      sanity: system.sanity ?? null,
      physical: {
        description: isRecord(system.physical) ? (system.physical.description ?? "") : "",
        wounds: isRecord(system.physical) ? (system.physical.wounds ?? "") : "",
        firstAidAttempted: isRecord(system.physical)
          ? system.physical.firstAidAttempted === true
          : false,
        exhausted: isRecord(system.physical) ? system.physical.exhausted === true : false,
      },
      biography: system.biography ?? null,
      corruption: system.corruption ?? null,
    },
    items: normalizedItems,
  };
}

export function untouchedDefaultFingerprint(actor: unknown): string {
  return contentHash(untouchedDefaultSlice(actor));
}

export function blankUntouchedFingerprint(): string {
  return BLANK_UNTOUCHED_FINGERPRINT;
}

export function isBlankUntouchedTarget(actor: unknown): boolean {
  return untouchedDefaultFingerprint(actor) === BLANK_UNTOUCHED_FINGERPRINT;
}

/** Target fingerprint used for stale-preview detection (#7). */
export function targetActorFingerprint(actor: unknown): string {
  if (!isRecord(actor)) {
    return contentHash(null);
  }
  return contentHash({
    id: typeof actor._id === "string" ? actor._id : null,
    name: typeof actor.name === "string" ? actor.name : null,
    type: typeof actor.type === "string" ? actor.type : null,
    system: actor.system ?? null,
    items: Array.isArray(actor.items)
      ? actor.items.map((item) => {
          if (!isRecord(item)) {
            return item;
          }
          return {
            _id: item._id ?? null,
            name: item.name ?? null,
            type: item.type ?? null,
            system: item.system ?? null,
            flags: item.flags ?? null,
          };
        })
      : null,
    flags: actor.flags ?? null,
  });
}
