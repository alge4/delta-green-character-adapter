import type { SafeValueSummary } from "./diagnostics.js";

export type SensitiveFieldKind =
  | "ordinary"
  | "personal"
  | "handlerOnly"
  | "notes"
  | "dateOfBirth"
  | "sourceFragment";

const sensitiveKinds = new Set<SensitiveFieldKind>([
  "personal",
  "handlerOnly",
  "notes",
  "dateOfBirth",
  "sourceFragment",
]);

export function createSafeValueSummary(
  value: unknown,
  fieldKind: SensitiveFieldKind,
): SafeValueSummary {
  if (sensitiveKinds.has(fieldKind)) {
    return { kind: "redacted", reason: fieldKind };
  }
  if (value === null || value === undefined) {
    return { kind: "omitted" };
  }
  const typeName = Array.isArray(value) ? "array" : typeof value;
  if (typeName === "string" || typeName === "number" || typeName === "boolean") {
    return { kind: "scalar", typeName, preview: String(value) };
  }
  return { kind: "type", typeName };
}

export function redactForLog(value: unknown, fieldKind: SensitiveFieldKind = "ordinary"): unknown {
  if (sensitiveKinds.has(fieldKind)) {
    return { redacted: fieldKind };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactForLog(entry, fieldKind));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = redactForLog(entry, classifyLogField(key));
    }
    return result;
  }
  return value;
}

function classifyLogField(key: string): SensitiveFieldKind {
  const normalized = key.toLowerCase();
  if (normalized.includes("handler")) {
    return "handlerOnly";
  }
  if (normalized.includes("note")) {
    return "notes";
  }
  if (normalized === "name" || normalized === "aliases" || normalized.includes("displayname")) {
    return "personal";
  }
  if (normalized.includes("dateofbirth") || normalized === "dob") {
    return "dateOfBirth";
  }
  if (normalized.includes("source") || normalized === "raw" || normalized.includes("fragment")) {
    return "sourceFragment";
  }
  return "ordinary";
}
