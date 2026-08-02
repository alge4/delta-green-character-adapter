import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AdapterOperationResult } from "@delta-green-character-adapter/adapter-core";
import type { AgentSnapshot, JsonValue } from "@delta-green-character-adapter/character-model";

// Compiled tests run from .test-dist/test/, so four levels reach the repo root.
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
export const foundryFixtureRoot = resolve(repoRoot, "fixtures/foundry/14.365-deltagreen-1.7.0");
export const canonicalFixtureRoot = resolve(repoRoot, "fixtures/canonical/1.0.0/export-to-foundry");

export const BLANK_ACTOR = "fvtt-Actor-blank-GZGftVGSKSRNSREr.json";
export const LIVE_GEORGE = "live-populated/fvtt-Actor-arendt,-george-1JRxGMZ9oXtUmaSg.json";
export const LIVE_STANDARD = "live-populated/fvtt-Actor-standard-8MeAVbzLk6HWm1DS.json";

export function readFoundryFixtureBytes(relativePath: string): Uint8Array {
  return readFileSync(resolve(foundryFixtureRoot, relativePath));
}

export function readFoundryFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(foundryFixtureRoot, relativePath), "utf8"));
}

export function readCanonicalFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(canonicalFixtureRoot, relativePath), "utf8"));
}

export function syntheticFixtureNames(): string[] {
  return readdirSync(resolve(foundryFixtureRoot, "synthetic"))
    .filter((name) => name.endsWith(".json"))
    .sort();
}

export function canonicalFixtureNames(): string[] {
  return readdirSync(canonicalFixtureRoot)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

export function liveApplyFixtureNames(): string[] {
  return readdirSync(resolve(foundryFixtureRoot, "live-apply"))
    .filter((name) => name.endsWith(".json"))
    .sort();
}

export function sha256Foundry(relativePath: string): string {
  const digest = createHash("sha256").update(readFoundryFixtureBytes(relativePath)).digest("hex");
  return `sha256:${digest}`;
}

export function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

let idCounter = 0;
export function sequentialIdFactory(): () => string {
  idCounter = 0;
  return () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${idCounter.toString(16).padStart(12, "0")}`;
  };
}

export function asSnapshot(result: AdapterOperationResult): AgentSnapshot {
  if (result.blocked || result.output === undefined) {
    throw new Error(`Expected a successful operation, blocked=${result.blocked}`);
  }
  return result.output as unknown as AgentSnapshot;
}

export function asActor(result: AdapterOperationResult): Record<string, JsonValue> {
  if (result.blocked || result.output === undefined) {
    throw new Error(`Expected a successful operation, blocked=${result.blocked}`);
  }
  return result.output as Record<string, JsonValue>;
}

export function hasDiagnostic(
  result: AdapterOperationResult,
  predicate: (code: string, message: string, sourcePath?: string) => boolean,
): boolean {
  return result.diagnostics.some((entry) =>
    predicate(entry.code, entry.message, entry.paths.source),
  );
}

export function knownLossFired(result: AdapterOperationResult, knownLossId: string): boolean {
  return result.diagnostics.some(
    (entry) => entry.localizationParameters.knownLossId === knownLossId,
  );
}

export function foundryPartition(
  snapshot: AgentSnapshot,
  key: "identity" | "sheet" | "raw",
): Record<string, JsonValue> {
  const partition = snapshot.extensions.foundry?.[key];
  if (partition === null || typeof partition !== "object" || Array.isArray(partition)) {
    throw new Error(`Missing extensions.foundry.${key} object`);
  }
  return partition as Record<string, JsonValue>;
}

export function actorSystem(actor: Record<string, JsonValue>): Record<string, JsonValue> {
  return actor.system as Record<string, JsonValue>;
}

export function actorItems(actor: Record<string, JsonValue>): Array<Record<string, JsonValue>> {
  return actor.items as Array<Record<string, JsonValue>>;
}
