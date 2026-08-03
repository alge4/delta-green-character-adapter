export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Foundry StringField / Document name persistence trims whitespace.
 * Normalize write values and verification expectations to match (#40 Chase).
 */
export function normalizeFoundryWriteValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeFoundryWriteValue(entry));
  }
  if (isRecord(value)) {
    const out: UnknownRecord = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = normalizeFoundryWriteValue(nested);
    }
    return out;
  }
  return value;
}

/** Equality that tolerates Foundry string trimming on leaf strings. */
export function foundryEqual(left: unknown, right: unknown): boolean {
  return deepEqual(normalizeFoundryWriteValue(left), normalizeFoundryWriteValue(right));
}

/** Decode one RFC 6901 JSON Pointer segment. */
export function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Split a JSON Pointer into decoded path segments (empty pointer → []). */
export function pointerSegments(path: string): string[] {
  if (path === "" || path === "/") {
    return [];
  }
  if (!path.startsWith("/")) {
    throw new Error(`Expected JSON Pointer, got: ${path}`);
  }
  return path
    .slice(1)
    .split("/")
    .map((segment) => decodePointerSegment(segment));
}

/**
 * Convert an Actor-level JSON Pointer to a Foundry update key
 * (`/system/foo` → `system.foo`, `/flags/...` → `flags...`, `/name` → `name`).
 */
export function pointerToActorUpdateKey(path: string): string {
  const segments = pointerSegments(path);
  if (segments.length === 0) {
    throw new Error("Cannot map root pointer to an Actor update key");
  }
  if (segments[0] === "items") {
    throw new Error(`Actor update key cannot target items path: ${path}`);
  }
  return segments.join(".");
}

/**
 * Parse `/items/{id}` or `/items/{id}/...` into item id and optional relative
 * Foundry update key (`system.score`, `flags...`, `name`).
 */
export function parseItemPointer(
  path: string,
): { readonly itemId: string; readonly relativeKey?: string } {
  const segments = pointerSegments(path);
  if (segments[0] !== "items" || segments[1] === undefined || segments[1] === "") {
    throw new Error(`Expected /items/{id} pointer, got: ${path}`);
  }
  const itemId = segments[1];
  if (segments.length === 2) {
    return { itemId };
  }
  return { itemId, relativeKey: segments.slice(2).join(".") };
}

/**
 * Resolve a JSON Pointer against Actor source. `/items/{id}/...` looks up embedded
 * Items by document `_id` (Foundry collection identity), not array index.
 */
export function getByPointer(root: unknown, path: string): unknown {
  const segments = pointerSegments(path);
  let current: unknown = root;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    if (Array.isArray(current)) {
      const asNumber = Number(segment);
      if (Number.isInteger(asNumber) && String(asNumber) === segment) {
        current = current[asNumber];
        continue;
      }
      const byId = current.find((entry) => isRecord(entry) && entry._id === segment);
      current = byId;
      continue;
    }
    if (!isRecord(current)) {
      return undefined;
    }
    // `/items/{id}` when items is missing falls through as undefined.
    current = current[segment];
  }
  return current;
}

/** Apply a dotted Foundry update key onto a mutable plain object. */
export function setByDotPath(root: UnknownRecord, key: string, value: unknown): void {
  const parts = key.split(".");
  let current: UnknownRecord = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!;
    const next = current[part];
    if (!isRecord(next)) {
      const created: UnknownRecord = {};
      current[part] = created;
      current = created;
    } else {
      current = next;
    }
  }
  const leaf = parts[parts.length - 1]!;
  current[leaf] = value;
}

/** Expand a Foundry diff that may use dotted keys into a nested object tree. */
export function expandUpdateDiff(diff: Record<string, unknown>): UnknownRecord {
  const out: UnknownRecord = {};
  for (const [key, value] of Object.entries(diff)) {
    if (key.includes(".")) {
      setByDotPath(out, key, value);
    } else if (isRecord(value) && isRecord(out[key])) {
      out[key] = deepMerge(out[key] as UnknownRecord, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function deepMerge(base: UnknownRecord, patch: UnknownRecord): UnknownRecord {
  const out: UnknownRecord = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(value) && isRecord(out[key])) {
      out[key] = deepMerge(out[key] as UnknownRecord, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
