import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planFoundryActorUpdate } from "../src/plan.js";
import { cloneJson, isRecord } from "../src/util.js";
import {
  BLANK_ACTOR,
  asPlan,
  bindActor,
  readCanonicalFixture,
  readFoundryFixture,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

describe("Derived maxima corrected remediation (#7)", () => {
  it("offers keep-target, imported, and corrected formula values when stats change maxima", () => {
    const snapshot = cloneJson(readCanonicalFixture("f1-minimal-create-new.json")) as Record<
      string,
      unknown
    >;
    const agentId = snapshot.agentId as string;
    // Snapshot keeps modest stats (formula HP max 12 from STR12/CON11 in f1).
    const blank = readFoundryFixture(BLANK_ACTOR);
    const target = bindActor(withActorName(blank, "Export Subject"), agentId) as Record<
      string,
      unknown
    >;
    const system = isRecord(target.system) ? { ...target.system } : {};
    system.biography = {
      ...(isRecord(system.biography) ? system.biography : {}),
      profession: "Agent",
    };
    // Target has higher stats/currents; import lowers formula maxima so corrected ≠ keep-target.
    system.statistics = {
      ...(isRecord(system.statistics) ? system.statistics : {}),
      str: { value: 16, distinguishing_feature: "" },
      con: { value: 16, distinguishing_feature: "" },
      pow: { value: 14, distinguishing_feature: "" },
    };
    system.health = { min: 0, value: 16, max: 16 };
    system.wp = { min: 0, value: 14, max: 14 };
    system.sanity = { value: 70, currentBreakingPoint: 56 };
    target.system = system;

    const result = planFoundryActorUpdate(snapshot, target, {
      createId: sequentialIdFactory(),
      mode: "merge",
    });
    const plan = asPlan(result);
    assert.equal(plan.blankTarget, false);

    const derived = result.diagnostics.filter(
      (entry) =>
        entry.code === "adapter.derived.conflict" &&
        entry.message.includes("derived maxima"),
    );
    assert.ok(derived.length >= 1);

    const sample = derived.find((entry) => entry.paths.target === "/system/health/value");
    assert.ok(sample);
    const actions = sample.remediations.map((entry) => entry.action);
    assert.deepEqual(actions.sort(), ["keepTarget", "replaceValue", "useDefault"].sort());
    const corrected = sample.remediations.find((entry) => entry.action === "useDefault");
    // f1 STR12+CON11 → ceil(23/2)=12
    assert.equal(corrected?.parameters?.value, 12);
    assert.ok(
      plan.entries.some(
        (entry) =>
          entry.path === "/system/health/value" &&
          (entry.operation === "preserve" || entry.selectedByDefault === false),
      ),
    );
  });
});
