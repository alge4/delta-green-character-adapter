import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planFoundryActorUpdate } from "@delta-green-character-adapter/foundry-update-planner";

import { applyFoundryActorUpdate } from "../src/apply.js";
import { cloneJson, isRecord } from "../src/paths.js";
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

describe("applyFoundryActorUpdate stale revalidation (PR #33 test plan)", () => {
  it("rejects a changed target fingerprint before any writes", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const agentId = (snapshot as { agentId: string }).agentId;
    const target = bindActor(
      withActorName(readFoundryFixture(BLANK_ACTOR), "Export Subject"),
      agentId,
    );
    const plan = asPlan(
      planFoundryActorUpdate(snapshot, target, {
        createId: sequentialIdFactory(),
        mode: "merge",
        callerIsGm: true,
      }),
    );

    const staleTarget = cloneJson(target) as Record<string, unknown>;
    staleTarget.name = "Changed After Preview";
    const runtime = createInMemoryActorRuntime({
      source: staleTarget,
      gm: true,
    });

    const result = await applyFoundryActorUpdate({
      plan,
      snapshot,
      runtime,
      options: { createId: sequentialIdFactory() },
    });

    assert.equal(result.blocked, true);
    assert.ok(result.diagnostics.some((entry) => entry.code === "adapter.state.stale"));
    assert.equal(runtime.writeCount, 0);
  });

  it("rejects a changed canonical source content hash before any writes", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const agentId = (snapshot as { agentId: string }).agentId;
    const target = bindActor(
      withActorName(readFoundryFixture(BLANK_ACTOR), "Export Subject"),
      agentId,
    );
    const plan = asPlan(
      planFoundryActorUpdate(snapshot, target, {
        createId: sequentialIdFactory(),
        mode: "merge",
        callerIsGm: true,
      }),
    );

    const staleSnapshot = cloneJson(snapshot) as Record<string, unknown>;
    const provenance = isRecord(staleSnapshot.provenance)
      ? { ...staleSnapshot.provenance }
      : {};
    provenance.contentHash =
      "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    staleSnapshot.provenance = provenance;

    const runtime = createInMemoryActorRuntime({
      source: target,
      gm: true,
    });

    const result = await applyFoundryActorUpdate({
      plan,
      snapshot: staleSnapshot,
      runtime,
      options: { createId: sequentialIdFactory() },
    });

    assert.equal(result.blocked, true);
    assert.ok(result.diagnostics.some((entry) => entry.code === "adapter.state.stale"));
    assert.equal(runtime.writeCount, 0);
  });
});
