import {
  ADAPTER_FLAG_NAMESPACE,
  SYSTEM_FLAG_NAMESPACE,
  UNARMED_ATTACK_ITEM_NAME,
  UNARMED_ATTACK_SYSTEM_NAME,
  type MappedItemType,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";

import { normalizeName, isRecord, type UnknownRecord } from "./util.js";

export type TargetItem = {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly system: UnknownRecord;
  readonly flags: UnknownRecord;
  readonly boundCanonicalId?: string;
  readonly systemManaged: boolean;
  readonly semanticKey: string;
};

export type DesiredItem = {
  readonly index: number;
  readonly canonicalId: string;
  readonly name: string;
  readonly type: MappedItemType | string;
  readonly system: UnknownRecord;
  readonly flags: UnknownRecord;
  readonly semanticKey: string;
  readonly systemManaged: boolean;
};

export type MatchKind =
  | "bound"
  | "provenance"
  | "uniqueSemantic"
  | "ambiguous"
  | "addition"
  | "unmatchedTarget";

export type CollectionMatch =
  | {
      readonly kind: "bound" | "provenance" | "uniqueSemantic";
      readonly desired: DesiredItem;
      readonly target: TargetItem;
    }
  | {
      readonly kind: "ambiguous";
      readonly desired: DesiredItem;
      readonly candidates: readonly TargetItem[];
    }
  | {
      readonly kind: "addition";
      readonly desired: DesiredItem;
    }
  | {
      readonly kind: "unmatchedTarget";
      readonly target: TargetItem;
    };

function itemAdapterFlags(flags: UnknownRecord): UnknownRecord {
  return isRecord(flags[ADAPTER_FLAG_NAMESPACE])
    ? (flags[ADAPTER_FLAG_NAMESPACE] as UnknownRecord)
    : {};
}

function itemSystemFlags(flags: UnknownRecord): UnknownRecord {
  return isRecord(flags[SYSTEM_FLAG_NAMESPACE])
    ? (flags[SYSTEM_FLAG_NAMESPACE] as UnknownRecord)
    : {};
}

export function isSystemUnarmedAttack(item: {
  readonly name: string;
  readonly flags: UnknownRecord;
}): boolean {
  const systemFlags = itemSystemFlags(item.flags);
  if (systemFlags.SystemName === UNARMED_ATTACK_SYSTEM_NAME) {
    return true;
  }
  return item.name === UNARMED_ATTACK_ITEM_NAME;
}

export function semanticIdentity(item: {
  readonly type: string;
  readonly name: string;
  readonly system: UnknownRecord;
}): string {
  const description =
    typeof item.system.description === "string" ? normalizeName(item.system.description) : "";
  return `${item.type}\0${normalizeName(item.name)}\0${description}`;
}

export function readTargetItems(actor: unknown): TargetItem[] {
  if (!isRecord(actor) || !Array.isArray(actor.items)) {
    return [];
  }
  const actorBindings = isRecord(actor.flags)
    ? itemAdapterFlags(actor.flags as UnknownRecord)
    : {};
  const itemBindings = isRecord(actorBindings.bindings)
    ? isRecord((actorBindings.bindings as UnknownRecord).items)
      ? ((actorBindings.bindings as UnknownRecord).items as UnknownRecord)
      : {}
    : {};

  const reverseBinding = new Map<string, string>();
  for (const [canonicalId, foundryId] of Object.entries(itemBindings)) {
    if (typeof foundryId === "string") {
      reverseBinding.set(foundryId, canonicalId);
    }
  }

  return actor.items.flatMap((item, index) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = typeof item._id === "string" ? item._id : `index:${index}`;
    const name = typeof item.name === "string" ? item.name : "";
    const type = typeof item.type === "string" ? item.type : "";
    const system = isRecord(item.system) ? item.system : {};
    const flags = isRecord(item.flags) ? item.flags : {};
    const adapter = itemAdapterFlags(flags);
    const boundCanonicalId =
      typeof adapter.canonicalId === "string"
        ? adapter.canonicalId
        : reverseBinding.get(id);
    return [
      {
        index,
        id,
        name,
        type,
        system,
        flags,
        ...(boundCanonicalId !== undefined ? { boundCanonicalId } : {}),
        systemManaged: isSystemUnarmedAttack({ name, flags }),
        semanticKey: semanticIdentity({ type, name, system }),
      },
    ];
  });
}

/**
 * Collection matching order from #7:
 * 1. canonical entry ID in adapter flags
 * 2. matching source identity/provenance (same canonical id via actor bindings)
 * 3. unique subtype + normalized semantic identity
 * 4. ambiguity
 * 5. addition / unmatched target
 *
 * Never uses array position; never crosses subtypes.
 */
export function matchCollections(
  desiredItems: readonly DesiredItem[],
  targetItems: readonly TargetItem[],
): CollectionMatch[] {
  const remaining = new Set(targetItems.map((item) => item.id));
  const byId = new Map(targetItems.map((item) => [item.id, item]));
  const byCanonical = new Map<string, TargetItem[]>();
  for (const item of targetItems) {
    if (item.boundCanonicalId === undefined) {
      continue;
    }
    const list = byCanonical.get(item.boundCanonicalId) ?? [];
    list.push(item);
    byCanonical.set(item.boundCanonicalId, list);
  }

  const matches: CollectionMatch[] = [];

  for (const desired of desiredItems) {
    const boundCandidates = (byCanonical.get(desired.canonicalId) ?? []).filter((item) =>
      remaining.has(item.id),
    );
    if (boundCandidates.length === 1 && boundCandidates[0]!.type === desired.type) {
      const target = boundCandidates[0]!;
      remaining.delete(target.id);
      matches.push({ kind: "bound", desired, target });
      continue;
    }

    const semanticCandidates = targetItems.filter(
      (item) =>
        remaining.has(item.id) &&
        item.type === desired.type &&
        item.semanticKey === desired.semanticKey,
    );
    if (semanticCandidates.length === 1) {
      const target = semanticCandidates[0]!;
      remaining.delete(target.id);
      matches.push({ kind: "uniqueSemantic", desired, target });
      continue;
    }
    if (semanticCandidates.length > 1) {
      matches.push({ kind: "ambiguous", desired, candidates: semanticCandidates });
      continue;
    }

    // System Unarmed Attack: bind by system-managed flag even when names differ slightly.
    if (desired.systemManaged) {
      const unarmed = targetItems.filter(
        (item) => remaining.has(item.id) && item.type === "weapon" && item.systemManaged,
      );
      if (unarmed.length === 1) {
        const target = unarmed[0]!;
        remaining.delete(target.id);
        matches.push({ kind: "bound", desired, target });
        continue;
      }
    }

    matches.push({ kind: "addition", desired });
  }

  for (const id of remaining) {
    const target = byId.get(id);
    if (target !== undefined) {
      matches.push({ kind: "unmatchedTarget", target });
    }
  }

  return matches;
}
