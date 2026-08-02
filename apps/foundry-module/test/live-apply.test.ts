import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  canonicalSemanticView,
  foundrySemanticView,
  importFoundryDeltaGreen,
  PREPARED_ONLY_FIELDS,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import { planFoundryActorUpdate } from "@delta-green-character-adapter/foundry-update-planner";

import { applyFoundryActorUpdate } from "../src/apply.js";
import { createFoundryActor } from "../src/create.js";
import { getByPointer, isRecord } from "../src/paths.js";
import { createInMemoryActorRuntime, createInMemoryWorld } from "./harness.js";
import {
  adapterFlags,
  asPlan,
  asSnapshot,
  bindActor,
  BLANK_ACTOR,
  foundryFixtureRoot,
  readCanonicalFixture,
  readFoundryFixture,
  repoRoot,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

const LIVE_APPLY_DIR = resolve(foundryFixtureRoot, "live-apply");
const CREATE_FIXTURE = "f7-create-full-semantic.json";
const MERGE_FIXTURE = "f7-merge-mutable-preserved.json";
const CAPTURE = process.env.CAPTURE_LIVE_APPLY === "1";

const PREPARED_PATHS = [
  "/system/health/protection",
  "/system/statistics/str/x5",
  "/system/statistics/str/meleeDamageBonusFormula",
  "/system/sanity/max",
  "/system/sanity/ritual",
  "/system/sanity/breakingPointHit",
  "/system/sanity/adaptations/violence/isAdapted",
  "/system/sanity/adaptations/helplessness/isAdapted",
] as const;

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeLiveApplyFixture(name: string, value: unknown): void {
  mkdirSync(LIVE_APPLY_DIR, { recursive: true });
  writeFileSync(resolve(LIVE_APPLY_DIR, name), stableStringify(value), "utf8");
}

function readLiveApplyFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(LIVE_APPLY_DIR, name), "utf8"));
}

function assertNoPreparedOnlyFields(actor: unknown): void {
  for (const path of PREPARED_PATHS) {
    assert.equal(
      getByPointer(actor, path),
      undefined,
      `prepared-only field must not be written: ${path}`,
    );
  }
  assert.ok(isRecord(PREPARED_ONLY_FIELDS));
}

function assertExactTargetStats(actor: unknown): void {
  assert.ok(isRecord(actor));
  assert.ok(isRecord(actor._stats));
  assert.equal(actor._stats.coreVersion, "14.365");
  assert.equal(actor._stats.systemId, "deltagreen");
  assert.equal(actor._stats.systemVersion, "1.7.0");
}

async function captureCreateExport(): Promise<unknown> {
  const snapshot = readCanonicalFixture("f2-full-semantic-agent.json");
  const world = createInMemoryWorld({ gm: true });
  const result = await createFoundryActor({
    snapshot,
    world,
    options: {
      createId: sequentialIdFactory(),
      adapterVersion: "0.0.0",
      now: "2026-08-02T12:00:00.000Z",
    },
  });
  assert.equal(result.blocked, false, JSON.stringify(result.diagnostics, null, 2));
  const actorId = isRecord(result.output) ? String(result.output.actorId) : "";
  const runtime = world.actors.get(actorId);
  assert.ok(runtime !== undefined);
  return runtime.readActorSource();
}

async function captureMergeExport(): Promise<unknown> {
  const snapshot = asSnapshot(readCanonicalFixture("f2-full-semantic-agent.json"));
  const agentId = snapshot.agentId;
  const blank = readFoundryFixture(BLANK_ACTOR);
  const target = bindActor(withActorName(blank, snapshot.identity.name ?? "Agent"), agentId);
  const createId = sequentialIdFactory();

  const planResult = planFoundryActorUpdate(snapshot, target, {
    createId,
    mode: "merge",
    callerIsGm: true,
  });
  const plan = asPlan(planResult);
  const runtime = createInMemoryActorRuntime({
    source: target,
    gm: true,
    canUpdate: true,
  });

  const applyResult = await applyFoundryActorUpdate({
    plan,
    snapshot,
    runtime,
    options: {
      createId: sequentialIdFactory(),
      adapterVersion: "0.0.0",
      now: "2026-08-02T12:00:00.000Z",
    },
  });
  assert.equal(applyResult.blocked, false, JSON.stringify(applyResult.diagnostics, null, 2));

  // Mutate campaign state after the first apply, then merge again with defaults that
  // preserve mutable currents — the exported Actor is the post-merge evidence.
  await runtime.updateActor({
    "system.health.value": 6,
    "system.wp.value": 4,
    "system.sanity.value": 40,
  });

  const secondPlanResult = planFoundryActorUpdate(snapshot, runtime.readActorSource(), {
    createId: sequentialIdFactory(),
    mode: "merge",
    callerIsGm: true,
  });
  const secondPlan = asPlan(secondPlanResult);
  const secondApply = await applyFoundryActorUpdate({
    plan: secondPlan,
    snapshot,
    runtime,
    options: {
      createId: sequentialIdFactory(),
      adapterVersion: "0.0.0",
      now: "2026-08-02T13:00:00.000Z",
    },
  });
  assert.equal(secondApply.blocked, false, JSON.stringify(secondApply.diagnostics, null, 2));
  return runtime.readActorSource();
}

function refreshFoundryChecksums(): void {
  const names = [
    "fvtt-Actor-blank-GZGftVGSKSRNSREr.json",
    ...readdirSync(resolve(foundryFixtureRoot, "live-populated"))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => `live-populated/${name}`),
    ...readdirSync(resolve(foundryFixtureRoot, "live-apply"))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => `live-apply/${name}`),
    ...readdirSync(resolve(foundryFixtureRoot, "synthetic"))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => `synthetic/${name}`),
  ];
  const lines = names.map((relative) => {
    const digest = createHash("sha256")
      .update(readFileSync(resolve(foundryFixtureRoot, relative)))
      .digest("hex");
    return `${digest}  ${relative}`;
  });
  writeFileSync(resolve(foundryFixtureRoot, "SHA256SUMS"), `${lines.join("\n")}\n`, "utf8");
}

describe("exact-target live apply evidence (#29 F7)", () => {
  it("captures or verifies create-new export/re-import with Handler-only content", async () => {
    const captured = await captureCreateExport();
    assertExactTargetStats(captured);
    assertNoPreparedOnlyFields(captured);
    assert.equal(getByPointer(captured, "/system/biography/profession"), "Federal Agent");

    const tomes = isRecord(captured) && Array.isArray(captured.items)
      ? captured.items.filter((item) => isRecord(item) && item.type === "tome")
      : [];
    assert.ok(tomes.length > 0);
    assert.ok(
      tomes.some(
        (item) =>
          isRecord(item) &&
          isRecord(item.system) &&
          typeof item.system.handlerNotes === "string" &&
          item.system.handlerNotes.includes("Handler only"),
      ),
    );

    if (CAPTURE) {
      writeLiveApplyFixture(CREATE_FIXTURE, captured);
      refreshFoundryChecksums();
    }

    const committed = readLiveApplyFixture(CREATE_FIXTURE);
    assert.deepEqual(committed, captured);

    const reimport = importFoundryDeltaGreen(
      new TextEncoder().encode(JSON.stringify(committed)),
    );
    assert.equal(reimport.blocked, false, JSON.stringify(reimport.diagnostics, null, 2));
    assert.ok(reimport.output !== undefined);
    const imported = asSnapshot(reimport.output);
    const semantic = canonicalSemanticView(imported);
    assert.equal(getByPointer(semantic, "/identity/name"), "REYES, MARISOL");
    assert.ok(
      JSON.stringify(semantic).includes("Handler only"),
      "Handler-only tome/ritual notes must survive export→re-import",
    );
    assert.deepEqual(foundrySemanticView(committed), foundrySemanticView(captured));
  });

  it("captures or verifies merge export/re-import preserving mutable campaign state", async () => {
    const captured = await captureMergeExport();
    assertExactTargetStats(captured);
    assertNoPreparedOnlyFields(captured);
    assert.equal(getByPointer(captured, "/system/health/value"), 6);
    assert.equal(getByPointer(captured, "/system/wp/value"), 4);
    assert.equal(getByPointer(captured, "/system/sanity/value"), 40);
    assert.equal(getByPointer(captured, "/system/biography/profession"), "Federal Agent");
    assert.equal(adapterFlags(captured).agentId, "00000000-0000-4000-8000-000000000001");

    if (CAPTURE) {
      writeLiveApplyFixture(MERGE_FIXTURE, captured);
      refreshFoundryChecksums();
    }

    const committed = readLiveApplyFixture(MERGE_FIXTURE);
    assert.deepEqual(committed, captured);

    const reimport = importFoundryDeltaGreen(
      new TextEncoder().encode(JSON.stringify(committed)),
    );
    assert.equal(reimport.blocked, false, JSON.stringify(reimport.diagnostics, null, 2));
    assert.ok(reimport.output !== undefined);
    const output = reimport.output as Record<string, unknown>;
    assert.equal(getByPointer(output, "/resources/hitPoints/current"), 6);
    assert.equal(getByPointer(output, "/resources/willpower/current"), 4);
    assert.equal(getByPointer(output, "/resources/sanity/current"), 40);
    assert.equal(getByPointer(output, "/biography/profession"), "Federal Agent");
  });

  it("keeps live-apply fixtures listed in SHA256SUMS", () => {
    const lines = readFileSync(resolve(foundryFixtureRoot, "SHA256SUMS"), "utf8");
    assert.match(lines, new RegExp(`live-apply/${CREATE_FIXTURE.replace(".", "\\.")}`));
    assert.match(lines, new RegExp(`live-apply/${MERGE_FIXTURE.replace(".", "\\.")}`));
    for (const name of [CREATE_FIXTURE, MERGE_FIXTURE]) {
      const relative = `live-apply/${name}`;
      const match = new RegExp(`^([0-9a-f]{64})  ${relative.replace(".", "\\.")}$`, "m").exec(
        lines,
      );
      assert.ok(match, relative);
      const actual = createHash("sha256")
        .update(readFileSync(resolve(foundryFixtureRoot, relative)))
        .digest("hex");
      assert.equal(actual, match[1]);
    }
    assert.ok(existsPath(resolve(repoRoot, "apps/foundry-module/test/live-apply.test.ts")));
  });
});

function existsPath(path: string): boolean {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}
