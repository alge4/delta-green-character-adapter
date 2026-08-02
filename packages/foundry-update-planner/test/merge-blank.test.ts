import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planFoundryActorUpdate } from "../src/plan.js";
import {
  BLANK_ACTOR,
  asPlan,
  bindActor,
  entriesOf,
  readCanonicalFixture,
  readFoundryFixture,
  selectedEntries,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

describe("Merge into blank fingerprint (F5a)", () => {
  const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
  const blank = readFoundryFixture(BLANK_ACTOR);
  const agentId = (snapshot as { agentId: string }).agentId;

  it("recognizes the pinned blank fingerprint and initializes without mutable warnings", () => {
    const target = bindActor(withActorName(blank, "Export Subject"), agentId);
    const result = planFoundryActorUpdate(snapshot, target, {
      createId: sequentialIdFactory(),
      mode: "merge",
    });
    const plan = asPlan(result);
    assert.equal(plan.blankTarget, true);
    assert.equal(plan.mode, "merge");
    assert.ok(selectedEntries(plan, "update").length > 0);
    assert.equal(
      result.diagnostics.some((entry) => entry.code === "adapter.state.mutable-replacement"),
      false,
    );
  });

  it("does not duplicate the system Unarmed Attack on blank merge", () => {
    const target = bindActor(withActorName(blank, "Export Subject"), agentId);
    const result = planFoundryActorUpdate(snapshot, target, {
      createId: sequentialIdFactory(),
    });
    const plan = asPlan(result);
    const unarmedAdds = entriesOf(
      plan,
      (entry) =>
        entry.operation === "add" &&
        entry.collection === "weapon" &&
        entry.proposed.kind === "type",
    );
    // Additions may exist for other item types, but not a second Unarmed Attack.
    const weaponAdds = selectedEntries(plan, "add").filter((entry) => entry.collection === "weapon");
    assert.equal(weaponAdds.length, 0);
    assert.equal(unarmedAdds.length, 0);
  });

  it("never proposes deletion in merge mode", () => {
    const target = bindActor(withActorName(blank, "Export Subject"), agentId);
    const result = planFoundryActorUpdate(snapshot, target, {
      createId: sequentialIdFactory(),
    });
    const plan = asPlan(result);
    assert.equal(plan.entries.some((entry) => entry.operation === "remove"), false);
  });
});
