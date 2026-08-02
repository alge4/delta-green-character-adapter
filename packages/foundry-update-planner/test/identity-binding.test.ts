import assert from "node:assert/strict";
import { describe, it } from "node:test";

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

describe("Actor Binding identity guard (#7)", () => {
  const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
  const blank = readFoundryFixture(BLANK_ACTOR);

  it("requires binding; unbound different name errors and does not authorize updates", () => {
    const result = planFoundryActorUpdate(snapshot, blank, {
      createId: sequentialIdFactory(),
    });
    assert.equal(result.blocked, true);
    assert.ok(
      result.diagnostics.some((entry) => entry.code === "adapter.identity.binding-required"),
    );
    const plan = asPlan(result);
    assert.equal(plan.binding.state, "unbound");
    assert.equal(
      plan.entries.some((entry) => entry.selectedByDefault && entry.operation !== "bind"),
      false,
    );
  });

  it("proposes binding on unbound normalized-name match without auto-binding", () => {
    const named = withActorName(blank, "Export Subject");
    const result = planFoundryActorUpdate(snapshot, named, {
      createId: sequentialIdFactory(),
    });
    const plan = asPlan(result);
    assert.equal(plan.binding.state, "proposed");
    assert.equal(plan.binding.proposedByName, true);
    const bind = plan.entries.find((entry) => entry.operation === "bind");
    assert.ok(bind);
    assert.equal(bind.selectedByDefault, false);
    assert.ok(
      result.diagnostics.some((entry) => entry.code === "adapter.identity.binding-proposed"),
    );
    // Name never authorizes an update: dependents stay deselected while bind is unconfirmed.
    assert.equal(
      plan.entries.some((entry) => entry.selectedByDefault && entry.operation !== "bind"),
      false,
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

  it("errors on conflicting stored agentId before rebind", () => {
    const conflicted = bindActor(blank, "11111111-1111-4111-8111-111111111111");
    const result = planFoundryActorUpdate(snapshot, conflicted, {
      createId: sequentialIdFactory(),
    });
    assert.equal(result.blocked, true);
    assert.ok(
      result.diagnostics.some((entry) => entry.code === "adapter.identity.binding-conflict"),
    );
  });
});
