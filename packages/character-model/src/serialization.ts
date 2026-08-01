import type { AgentSnapshot, JsonValue } from "./schemas.js";
import { parseAgentSnapshot } from "./schemas.js";

export function serializeAgentSnapshot(snapshot: AgentSnapshot): string {
  const validated = parseAgentSnapshot(snapshot);
  return `${JSON.stringify(sortObjectKeys(validated as JsonValue), null, 2)}\n`;
}

function sortObjectKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, sortObjectKeys(entry)]),
    );
  }
  return value;
}
