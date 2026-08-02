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

describe("applyFoundryActorUpdate permissions", () => {
  it("rejects when canUpdateActor is false before any writes", async () => {
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

    const runtime = createInMemoryActorRuntime({
      source: target,
      gm: true,
      canUpdate: false,
    });

    const result = await applyFoundryActorUpdate({
      plan,
      snapshot,
      runtime,
      options: { createId: sequentialIdFactory() },
    });

    assert.equal(result.blocked, true);
    assert.ok(result.diagnostics.some((entry) => entry.code === "adapter.permission.denied"));
    assert.equal(runtime.writeCount, 0);
    assert.equal(runtime.updateCalls, 0);
  });

  it("rejects selected Handler-only work for non-GM callers before writes", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const agentId = (snapshot as { agentId: string }).agentId;
    const target = bindActor(
      withActorName(readFoundryFixture(BLANK_ACTOR), "Export Subject"),
      agentId,
    );
    const base = asPlan(
      planFoundryActorUpdate(snapshot, target, {
        createId: sequentialIdFactory(),
        mode: "merge",
        callerIsGm: true,
      }),
    );

    const profileEntry = base.entries.find(
      (entry) => entry.selectedByDefault && entry.operation === "update",
    );
    assert.ok(profileEntry !== undefined);

    const plan = {
      ...base,
      permissions: {
        ...base.permissions,
        requiresGmForHandlerContent: true,
        callerIsGm: false,
      },
      entries: base.entries.map((entry) =>
        entry.id === profileEntry.id
          ? {
              ...entry,
              fieldClass: "handlerOnly" as const,
              selectedByDefault: true,
            }
          : entry,
      ),
    };

    const runtime = createInMemoryActorRuntime({
      source: target,
      gm: false,
      canUpdate: true,
    });

    const result = await applyFoundryActorUpdate({
      plan,
      snapshot,
      runtime,
      options: { createId: sequentialIdFactory() },
    });

    assert.equal(result.blocked, true);
    assert.ok(result.diagnostics.some((entry) => entry.code === "adapter.permission.denied"));
    assert.equal(runtime.writeCount, 0);
  });
});
