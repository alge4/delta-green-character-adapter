import {
  UNARMED_ATTACK_ITEM_NAME,
  UNARMED_ATTACK_SYSTEM_NAME,
  SYSTEM_FLAG_NAMESPACE,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { AgentSnapshot } from "@delta-green-character-adapter/character-model";

import { isSystemUnarmedAttack, semanticIdentity, type DesiredItem } from "./matching.js";
import { isRecord, type UnknownRecord } from "./util.js";

/**
 * Rebuild desired embedded Items from export output while attaching stable canonical IDs
 * from the Agent Snapshot. Export create-data does not yet stamp item canonical IDs.
 */
export function desiredItemsFromSnapshotAndExport(
  snapshot: AgentSnapshot,
  exportedActor: unknown,
): DesiredItem[] {
  if (!isRecord(exportedActor) || !Array.isArray(exportedActor.items)) {
    return [];
  }

  const exportedItems = exportedActor.items.filter(isRecord);
  const queueByType = new Map<string, UnknownRecord[]>();
  for (const item of exportedItems) {
    const type = typeof item.type === "string" ? item.type : "";
    const list = queueByType.get(type) ?? [];
    list.push(item);
    queueByType.set(type, list);
  }

  function take(type: string): UnknownRecord | undefined {
    const list = queueByType.get(type);
    return list?.shift();
  }

  const desired: DesiredItem[] = [];
  let index = 0;

  function pushDesired(canonicalId: string, item: UnknownRecord): void {
    const name = typeof item.name === "string" ? item.name : "";
    const type = typeof item.type === "string" ? item.type : "";
    const system = isRecord(item.system) ? item.system : {};
    const flags = isRecord(item.flags) ? item.flags : {};
    desired.push({
      index: index++,
      canonicalId,
      name,
      type,
      system,
      flags,
      semanticKey: semanticIdentity({ type, name, system }),
      systemManaged: isSystemUnarmedAttack({ name, flags }),
    });
  }

  // Export writes Unarmed Attack first when synthesizing, or inline when bound.
  const weaponCanonicalIds = snapshot.inventory.weapons.map((weapon) => weapon.id);
  let weaponCursor = 0;
  const weaponItems = [...(queueByType.get("weapon") ?? [])];
  queueByType.set("weapon", []);
  for (const item of weaponItems) {
    const flags = isRecord(item.flags) ? item.flags : {};
    const systemFlags = isRecord(flags[SYSTEM_FLAG_NAMESPACE])
      ? (flags[SYSTEM_FLAG_NAMESPACE] as UnknownRecord)
      : {};
    const isUnarmed =
      systemFlags.SystemName === UNARMED_ATTACK_SYSTEM_NAME ||
      item.name === UNARMED_ATTACK_ITEM_NAME;
    if (isUnarmed) {
      const identity = isRecord(snapshot.extensions.foundry)
        ? (snapshot.extensions.foundry as UnknownRecord).identity
        : undefined;
      const systemOwnedItems =
        isRecord(identity) && isRecord(identity.systemOwnedItems)
          ? (identity.systemOwnedItems as UnknownRecord)
          : undefined;
      const matchedWeapon = snapshot.inventory.weapons.find((weapon) => {
        if (weapon.name === UNARMED_ATTACK_ITEM_NAME) {
          return true;
        }
        return systemOwnedItems !== undefined && isRecord(systemOwnedItems[weapon.id]);
      });
      pushDesired(matchedWeapon?.id ?? "system:unarmed-attack", item);
      if (matchedWeapon !== undefined) {
        const at = weaponCanonicalIds.indexOf(matchedWeapon.id);
        if (at >= 0) {
          weaponCanonicalIds.splice(at, 1);
        }
      }
      continue;
    }
    const canonicalId = weaponCanonicalIds[weaponCursor++] ?? `weapon:orphan:${index}`;
    pushDesired(canonicalId, item);
  }

  for (const entry of snapshot.inventory.armor) {
    const item = take("armor");
    if (item !== undefined) {
      pushDesired(entry.id, item);
    }
  }
  for (const entry of snapshot.inventory.gear) {
    const item = take("gear");
    if (item !== undefined) {
      pushDesired(entry.id, item);
    }
  }
  for (const entry of snapshot.inventory.tomes) {
    const item = take("tome");
    if (item !== undefined) {
      pushDesired(entry.id, item);
    }
  }
  for (const entry of snapshot.inventory.rituals) {
    const item = take("ritual");
    if (item !== undefined) {
      pushDesired(entry.id, item);
    }
  }
  for (const entry of snapshot.relationships.bonds) {
    const item = take("bond");
    if (item !== undefined) {
      pushDesired(entry.id, item);
    }
  }

  const linkedDisorderIds = new Set(
    snapshot.psychology.motivations
      .map((motivation) => motivation.linkedDisorderId)
      .filter((id): id is string => id !== undefined),
  );
  for (const entry of snapshot.psychology.motivations) {
    const item = take("motivation");
    if (item !== undefined) {
      pushDesired(entry.id, item);
    }
  }
  for (const entry of snapshot.psychology.disorders) {
    if (linkedDisorderIds.has(entry.id)) {
      continue;
    }
    const item = take("motivation");
    if (item !== undefined) {
      pushDesired(entry.id, item);
    }
  }

  // Any remaining exported items (should be rare) keep synthetic ids.
  for (const [type, list] of queueByType) {
    for (const item of list) {
      pushDesired(`export:${type}:${index}`, item);
    }
  }

  return desired;
}
