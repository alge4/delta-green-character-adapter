import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planFoundryActorUpdate } from "@delta-green-character-adapter/foundry-update-planner";

import { applyFoundryActorUpdate } from "../src/apply.js";
import { createInMemoryActorRuntime } from "./harness.js";
import {
  BLANK_ACTOR,
  asPlan,
  bindActor,
  readCanonicalFixture,
  readFoundryFixture,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

describe("applyFoundryActorUpdate reapply", () => {
  it("successful apply then replan+apply of the same snapshot is a no-op with no writes", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const agentId = (snapshot as { agentId: string }).agentId;
    const target = bindActor(
      withActorName(readFoundryFixture(BLANK_ACTOR), "Export Subject"),
      agentId,
    );

    const runtime = createInMemoryActorRuntime({
      source: target,
      gm: true,
    });

    const firstPlan = asPlan(
      planFoundryActorUpdate(snapshot, runtime.readActorSource(), {
        createId: sequentialIdFactory(),
        mode: "merge",
        callerIsGm: true,
      }),
    );
    const first = await applyFoundryActorUpdate({
      plan: firstPlan,
      snapshot,
      runtime,
      options: {
        createId: sequentialIdFactory(),
        now: "2026-08-02T12:00:00.000Z",
      },
    });
    assert.equal(first.blocked, false, JSON.stringify(first.diagnostics, null, 2));
    const writeCountAfterApply = runtime.writeCount;
    assert.ok(writeCountAfterApply > 0);

    const secondPlan = asPlan(
      planFoundryActorUpdate(snapshot, runtime.readActorSource(), {
        createId: sequentialIdFactory(),
        mode: "merge",
        callerIsGm: true,
      }),
    );
    const second = await applyFoundryActorUpdate({
      plan: secondPlan,
      snapshot,
      runtime,
      options: {
        createId: sequentialIdFactory(),
        now: "2026-08-02T12:01:00.000Z",
      },
    });

    assert.equal(second.blocked, false, JSON.stringify(second.diagnostics, null, 2));
    assert.ok(
      secondPlan.alreadyUpToDate ||
        (second.output !== undefined &&
          typeof second.output === "object" &&
          second.output !== null &&
          "kind" in second.output &&
          second.output.kind === "noop"),
    );
    assert.equal(runtime.writeCount, writeCountAfterApply);
  });
});
