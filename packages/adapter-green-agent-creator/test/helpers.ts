import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentSnapshot } from "@delta-green-character-adapter/character-model";
import type { AdapterOperationResult } from "@delta-green-character-adapter/adapter-core";

// Compiled tests run from .test-dist/test/, so four levels reach the repo root.
export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
export const fixtureRoot = resolve(repoRoot, "fixtures/green-agent-creator/5c9e92d");

export function readFixtureBytes(relativePath: string): Uint8Array {
  return readFileSync(resolve(fixtureRoot, relativePath));
}

export function sha256File(relativePath: string): string {
  const digest = createHash("sha256").update(readFixtureBytes(relativePath)).digest("hex");
  return `sha256:${digest}`;
}

export function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

let idCounter = 0;
export function resetIds(): void {
  idCounter = 0;
}

export function sequentialIdFactory(): () => string {
  resetIds();
  return () => {
    idCounter += 1;
    const hex = idCounter.toString(16).padStart(12, "0");
    return `00000000-0000-4000-8000-${hex}`;
  };
}

export function asSnapshot(result: AdapterOperationResult): AgentSnapshot {
  if (result.blocked || result.output === undefined) {
    throw new Error(`Expected successful import, blocked=${result.blocked}`);
  }
  return result.output as AgentSnapshot;
}

export function hasDiagnostic(
  result: AdapterOperationResult,
  predicate: (code: string, message: string, sourcePath?: string) => boolean,
): boolean {
  return result.diagnostics.some((diagnostic) =>
    predicate(diagnostic.code, diagnostic.message, diagnostic.paths.source),
  );
}

export function knownLossFired(result: AdapterOperationResult, knownLossId: string): boolean {
  return result.diagnostics.some(
    (diagnostic) => diagnostic.localizationParameters.knownLossId === knownLossId,
  );
}

export function extensionPartition(
  snapshot: AgentSnapshot,
  key: "workflow" | "skillConstruction" | "sheetBaseline" | "identity" | "raw",
): Record<string, unknown> {
  const extension = snapshot.extensions.greenAgentCreator;
  const partition = extension?.[key];
  if (partition === null || typeof partition !== "object" || Array.isArray(partition)) {
    throw new Error(`Missing extensions.greenAgentCreator.${key} object`);
  }
  return partition as Record<string, unknown>;
}
