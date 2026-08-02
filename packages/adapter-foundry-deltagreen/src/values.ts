import { createHash } from "node:crypto";

import type { JsonValue } from "@delta-green-character-adapter/character-model";

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function toInt(value: number): number {
  return Math.trunc(value);
}

export function readRecord(source: UnknownRecord | undefined, key: string): UnknownRecord | undefined {
  const value = source?.[key];
  return isRecord(value) ? value : undefined;
}

export function readText(source: UnknownRecord | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readInt(source: UnknownRecord | undefined, key: string): number | undefined {
  const value = source?.[key];
  return isFiniteNumber(value) ? toInt(value) : undefined;
}

export function readBoolean(source: UnknownRecord | undefined, key: string): boolean | undefined {
  const value = source?.[key];
  return typeof value === "boolean" ? value : undefined;
}

export function asJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => asJsonValue(entry));
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

export function contentHashOf(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function decodeInput(input: string | Uint8Array): { bytes: Uint8Array; text: string } {
  if (typeof input === "string") {
    return { bytes: new TextEncoder().encode(input), text: input };
  }
  return { bytes: input, text: new TextDecoder().decode(input) };
}

export function pointer(...segments: Array<string | number>): string {
  return `/${segments
    .map((segment) => String(segment).replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/")}`;
}

export function pathToPointer(path: string): string {
  if (path.startsWith("/")) {
    return path;
  }
  return `/${path.replace(/\[(\d+)\]/g, "/$1").replace(/\./g, "/")}`;
}

const HTML_TAG = /<\/?[a-z][\s\S]*?>/i;

export function looksLikeHtml(content: string): boolean {
  return HTML_TAG.test(content);
}

export function escapeHtml(content: string): string {
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Conservative plain/markdown → HTML conversion: escape, then keep paragraph breaks. */
export function textToHtml(content: string): string {
  const paragraphs = escapeHtml(content)
    .split(/\r?\n\r?\n+/)
    .map((paragraph) => paragraph.replace(/\r?\n/g, "<br>"))
    .filter((paragraph) => paragraph.length > 0);
  if (paragraphs.length === 0) {
    return "";
  }
  return paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
}

export function plainTextFrom(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Foundry writes typed-skill groups as display text; canonical stores handbook family ids. */
export function normalizeTypedSkillGroup(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isCanonicalId(value: unknown): value is string {
  return typeof value === "string" && UUID_V4.test(value);
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
