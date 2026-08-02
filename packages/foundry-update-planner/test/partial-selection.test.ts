import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planFoundryActorUpdate } from "../src/plan.js";
import {
  BLANK_ACTOR,
  asPlan,
  readCanonicalFixture,
  readFoundryFixture,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

describe("Partial selection and dependency validity", () => {
  it("deselects dependent entries when an override clears their dependency", () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const unbound = withActorName(readFoundryFixture(BLANK_ACTOR), "Export Subject");

    const proposed = asPlan(
      planFoundryActorUpdate(snapshot, unbound, { createId: sequentialIdFactory() }),
    );
    const bind = proposed.entries.find((entry) => entry.operation === "bind");
    assert.ok(bind);
    const child = proposed.entries.find(
      (entry) => entry.dependencies.includes(bind.id) && entry.operation === "update",
    );
    assert.ok(child);
    assert.equal(bind.selectedByDefault, false);
    assert.equal(child.selectedByDefault, false);

    const enabled = asPlan(
      planFoundryActorUpdate(snapshot, unbound, {
        createId: sequentialIdFactory(),
        selectionOverrides: {
          [bind.id]: true,
          [child.id]: true,
        },
      }),
    );
    assert.equal(enabled.entries.find((entry) => entry.id === bind.id)?.selectedByDefault, true);
    assert.equal(enabled.entries.find((entry) => entry.id === child.id)?.selectedByDefault, true);

    const clearedResult = planFoundryActorUpdate(snapshot, unbound, {
      createId: sequentialIdFactory(),
      selectionOverrides: {
        [bind.id]: false,
        [child.id]: true,
      },
    });
    const cleared = asPlan(clearedResult);
    assert.equal(cleared.entries.find((entry) => entry.id === bind.id)?.selectedByDefault, false);
    assert.equal(cleared.entries.find((entry) => entry.id === child.id)?.selectedByDefault, false);
    assert.ok(
      clearedResult.diagnostics.some((entry) => entry.code === "adapter.derived.conflict"),
    );
  });
});
