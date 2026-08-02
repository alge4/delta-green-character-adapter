import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AdapterOperationResult } from "@delta-green-character-adapter/adapter-core";
import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { AgentSnapshot, JsonValue } from "@delta-green-character-adapter/character-model";

import { parseUpdatePlan, type UpdatePlan } from "../src/schemas.js";
import { cloneJson, isRecord } from "../src/util.js";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
export const foundryFixtureRoot = resolve(repoRoot, "fixtures/foundry/14.365-deltagreen-1.7.0");
export const canonicalFixtureRoot = resolve(repoRoot, "fixtures/canonical/1.0.0/export-to-foundry");

export const BLANK_ACTOR = "fvtt-Actor-blank-GZGftVGSKSRNSREr.json";
export const LIVE_STANDARD = "live-populated/fvtt-Actor-standard-8MeAVbzLk6HWm1DS.json";

export function readFoundryFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(foundryFixtureRoot, relativePath), "utf8"));
}

export function readCanonicalFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(canonicalFixtureRoot, relativePath), "utf8"));
}

let idCounter = 0;
export function sequentialIdFactory(): () => string {
  idCounter = 0;
  return () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${idCounter.toString(16).padStart(12, "0")}`;
  };
}

export function asPlan(result: AdapterOperationResult): UpdatePlan {
  if (result.plan === undefined) {
    throw new Error(`Expected a plan, blocked=${result.blocked}`);
  }
  return parseUpdatePlan(result.plan);
}

export function bindActor(
  actor: unknown,
  agentId: string,
  extras: Record<string, JsonValue> = {},
): unknown {
  const copy = cloneJson(actor) as Record<string, JsonValue>;
  const flags = isRecord(copy.flags) ? { ...copy.flags } : {};
  const adapter = isRecord(flags[ADAPTER_FLAG_NAMESPACE])
    ? { ...(flags[ADAPTER_FLAG_NAMESPACE] as Record<string, JsonValue>) }
    : {};
  flags[ADAPTER_FLAG_NAMESPACE] = {
    ...adapter,
    agentId,
    ...extras,
  };
  copy.flags = flags;
  return copy;
}

export function withActorName(actor: unknown, name: string): unknown {
  const copy = cloneJson(actor) as Record<string, JsonValue>;
  copy.name = name;
  return copy;
}

export function selectedEntries(plan: UpdatePlan, operation?: string) {
  return plan.entries.filter(
    (entry) => entry.selectedByDefault && (operation === undefined || entry.operation === operation),
  );
}

export function entriesOf(
  plan: UpdatePlan,
  predicate: (entry: UpdatePlan["entries"][number]) => boolean,
) {
  return plan.entries.filter(predicate);
}

export function asSnapshot(value: unknown): AgentSnapshot {
  return value as AgentSnapshot;
}
