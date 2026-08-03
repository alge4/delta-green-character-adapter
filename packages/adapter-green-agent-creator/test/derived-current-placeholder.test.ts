import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAgentSnapshot } from "@delta-green-character-adapter/character-model";

import { importGreenAgentCreator } from "../src/index.js";
import { asSnapshot, readFixtureBytes, sequentialIdFactory } from "./helpers.js";

describe("derivedCurrent placeholder zeros (#40)", () => {
  it("defaults an all-zero derivedCurrent block to derivedAttributes maxima", () => {
    const bytes = readFixtureBytes("caleb.json");
    const result = importGreenAgentCreator(bytes, { createId: sequentialIdFactory() });
    assert.equal(result.blocked, false);
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    assert.equal(snapshot.resources.hitPoints?.current, snapshot.resources.hitPoints?.maximum);
    assert.equal(snapshot.resources.willpower?.current, snapshot.resources.willpower?.maximum);
    assert.equal(snapshot.resources.sanity?.current, snapshot.resources.sanity?.maximum);
    assert.equal(
      snapshot.resources.breakingPoint?.current,
      snapshot.resources.breakingPoint?.baseline,
    );
    assert.ok(
      (result.diagnostics ?? []).some(
        (entry) =>
          entry.code.includes("safeDefault") ||
          entry.message.includes("all-zero derivedCurrent block"),
      ),
    );
  });

  it("keeps explicitly edited non-zero derivedCurrent values", () => {
    const bytes = readFixtureBytes("synthetic/f5a-edited-currents.json");
    const result = importGreenAgentCreator(bytes, { createId: sequentialIdFactory() });
    assert.equal(result.blocked, false);
    const snapshot = parseAgentSnapshot(asSnapshot(result));
    assert.equal(snapshot.resources.hitPoints?.current, 3);
    assert.equal(snapshot.resources.willpower?.current, 5);
    assert.equal(snapshot.resources.sanity?.current, 40);
    assert.equal(snapshot.resources.breakingPoint?.current, 30);
  });
});
