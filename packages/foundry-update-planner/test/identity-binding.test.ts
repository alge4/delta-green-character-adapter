import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";

import { planFoundryActorUpdate } from "../src/plan.js";
import {
  BLANK_ACTOR,
  asPlan,
  bindActor,
  readCanonicalFixture,
  readFoundryFixture,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

function hasActorAgentIdBind(plan: ReturnType<typeof asPlan>): boolean {
  const agentIdPath = `/flags/${ADAPTER_FLAG_NAMESPACE}/agentId`;
  return plan.entries.some((entry) => entry.operation === "bind" && entry.path === agentIdPath);
}

describe("open-sheet import target (no Actor Binding gate)", () => {
  const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
  const blank = readFoundryFixture(BLANK_ACTOR);

  it("plans profile updates for a differently named open sheet without blocking", () => {
    const result = planFoundryActorUpdate(snapshot, blank, {
      createId: sequentialIdFactory(),
    });
    assert.equal(result.blocked, false);
    assert.ok(
      result.diagnostics.some((entry) => entry.code === "adapter.identity.binding-required"),
    );
    const plan = asPlan(result);
    assert.equal(plan.binding.state, "unbound");
    assert.equal(hasActorAgentIdBind(plan), false);
    assert.ok(
      plan.entries.some((entry) => entry.selectedByDefault && entry.operation !== "preserve"),
    );
  });

  it("plans updates when the Actor name matches without a bind confirmation row", () => {
    const named = withActorName(blank, "Export Subject");
    const result = planFoundryActorUpdate(snapshot, named, {
      createId: sequentialIdFactory(),
    });
    assert.equal(result.blocked, false);
    const plan = asPlan(result);
    assert.equal(plan.binding.state, "proposed");
    assert.equal(plan.binding.proposedByName, true);
    assert.equal(hasActorAgentIdBind(plan), false);
    assert.ok(
      plan.entries.some((entry) => entry.selectedByDefault && entry.operation !== "preserve"),
    );
  });

  it("proceeds when stored agentId matches the snapshot", () => {
    const bound = bindActor(withActorName(blank, "Export Subject"), (snapshot as { agentId: string }).agentId);
    const result = planFoundryActorUpdate(snapshot, bound, {
      createId: sequentialIdFactory(),
    });
    const plan = asPlan(result);
    assert.equal(plan.binding.state, "bound");
    assert.equal(result.blocked, false);
  });

  it("does not block when stored agentId conflicts; apply will refresh audit identity", () => {
    const conflicted = bindActor(blank, "11111111-1111-4111-8111-111111111111");
    const result = planFoundryActorUpdate(snapshot, conflicted, {
      createId: sequentialIdFactory(),
    });
    assert.equal(result.blocked, false);
    assert.ok(
      result.diagnostics.some((entry) => entry.code === "adapter.identity.binding-conflict"),
    );
    const plan = asPlan(result);
    assert.equal(plan.binding.state, "conflict");
    assert.ok(
      plan.entries.some((entry) => entry.selectedByDefault && entry.operation !== "preserve"),
    );
  });
});
