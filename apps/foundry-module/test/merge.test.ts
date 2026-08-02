import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planFoundryActorUpdate } from "@delta-green-character-adapter/foundry-update-planner";

import { applyFoundryActorUpdate } from "../src/apply.js";
import { getByPointer, isRecord } from "../src/paths.js";
import { createInMemoryActorRuntime } from "./harness.js";
import {
  BLANK_ACTOR,
  adapterFlags,
  asPlan,
  bindActor,
  readCanonicalFixture,
  readFoundryFixture,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

describe("applyFoundryActorUpdate merge", () => {
  it("merges selected profile fields into a bound blank Actor and writes success audit", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const agentId = (snapshot as { agentId: string }).agentId;
    const blank = readFoundryFixture(BLANK_ACTOR);
    const target = bindActor(withActorName(blank, "Export Subject"), agentId);
    const createId = sequentialIdFactory();

    const planResult = planFoundryActorUpdate(snapshot, target, {
      createId,
      mode: "merge",
      callerIsGm: true,
    });
    const plan = asPlan(planResult);
    assert.equal(plan.blankTarget, true);
    assert.ok(plan.entries.some((entry) => entry.selectedByDefault && entry.operation === "update"));

    const runtime = createInMemoryActorRuntime({
      source: target,
      gm: true,
      canUpdate: true,
    });
    const writesBefore = runtime.writeCount;

    const result = await applyFoundryActorUpdate({
      plan,
      snapshot,
      runtime,
      options: {
        createId: sequentialIdFactory(),
        adapterVersion: "0.0.0",
        now: "2026-08-02T12:00:00.000Z",
      },
    });

    assert.equal(result.blocked, false, JSON.stringify(result.diagnostics, null, 2));
    assert.ok(runtime.writeCount > writesBefore);
    assert.ok(isRecord(result.output) && result.output.kind === "applied");

    const source = runtime.readActorSource();
    assert.equal(getByPointer(source, "/system/statistics/str/value"), 12);
    assert.equal(getByPointer(source, "/system/statistics/con/value"), 11);
    assert.equal(getByPointer(source, "/system/skills/firearms/proficiency"), 40);

    // Mutable defaults preserved unless selected — blank merge selects mutable init, but
    // Foundry-owned settings must remain.
    assert.ok(isRecord(getByPointer(source, "/system/settings")));

    const flags = adapterFlags(source);
    assert.equal(flags.agentId, agentId);
    assert.ok(isRecord(flags.audit));
    assert.equal(flags.audit.mode, "merge");
    assert.equal(flags.audit.planDigest, plan.planDigest);
    assert.equal(flags.audit.targetFingerprint, plan.targetFingerprint);
    assert.equal(typeof flags.audit.resultFingerprint, "string");
    assert.ok(isRecord(flags.audit.operationCounts));
  });
});
