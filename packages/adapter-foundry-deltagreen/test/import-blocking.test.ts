import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogueDiagnosticCodes } from "@delta-green-character-adapter/adapter-core";

import { importFoundryDeltaGreen } from "../src/index.js";
import { encodeJson, readFoundryFixture } from "./helpers.js";

const statistics = {
  str: { value: 10, distinguishing_feature: "" },
  con: { value: 10, distinguishing_feature: "" },
  dex: { value: 10, distinguishing_feature: "" },
  int: { value: 10, distinguishing_feature: "" },
  pow: { value: 10, distinguishing_feature: "" },
  cha: { value: 10, distinguishing_feature: "" },
};

function agent(system: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return { name: "Blocking", type: "agent", system: { statistics, ...system }, ...extra };
}

describe("importFoundryDeltaGreen blocking rules (#25 inventory)", () => {
  it("blocks when the input is not valid JSON", () => {
    const result = importFoundryDeltaGreen("{ not json");
    assert.equal(result.blocked, true);
    assert.equal(result.output, undefined);
    assert.equal(result.completeness, "red");
  });

  it("blocks when the root is not a JSON object", () => {
    const result = importFoundryDeltaGreen(encodeJson(["not", "an", "actor"]));
    assert.equal(result.blocked, true);
    assert.ok(
      result.diagnostics.some((entry) => entry.code === catalogueDiagnosticCodes.malformedStructure),
    );
  });

  it("blocks a present Actor type other than agent", () => {
    const result = importFoundryDeltaGreen(encodeJson(agent({}, { type: "npc" })));
    assert.equal(result.blocked, true);
    assert.ok(result.diagnostics.some((entry) => entry.paths.source === "/type"));
  });

  it("accepts a missing Actor type", () => {
    const { type: _type, ...withoutType } = agent();
    const result = importFoundryDeltaGreen(encodeJson(withoutType));
    assert.equal(result.blocked, false);
  });

  it("blocks when system is missing or not an object", () => {
    assert.equal(importFoundryDeltaGreen(encodeJson({ name: "x", type: "agent" })).blocked, true);
    const nonObject = importFoundryDeltaGreen(
      encodeJson({ name: "x", type: "agent", system: "nope" }),
    );
    assert.equal(nonObject.blocked, true);
    assert.ok(nonObject.diagnostics.some((entry) => entry.paths.source === "/system"));
  });

  it("blocks when any of the six statistics is missing or non-finite", () => {
    const { pow: _pow, ...withoutPow } = statistics;
    const missing = importFoundryDeltaGreen(
      encodeJson({ name: "x", type: "agent", system: { statistics: withoutPow } }),
    );
    assert.equal(missing.blocked, true);
    assert.ok(missing.diagnostics.some((entry) => entry.paths.source === "/system/statistics/pow/value"));

    const nonNumeric = importFoundryDeltaGreen(
      encodeJson(agent({ statistics: { ...statistics, cha: { value: "twelve" } } })),
    );
    assert.equal(nonNumeric.blocked, true);
  });

  it("blocks a foreign _stats.systemId with an unsupported-version diagnostic", () => {
    const result = importFoundryDeltaGreen(
      encodeJson(agent({}, { _stats: { systemId: "dnd5e", systemVersion: "4.4.4", coreVersion: "14.365" } })),
    );
    assert.equal(result.blocked, true);
    assert.ok(
      result.diagnostics.some(
        (entry) =>
          entry.code === catalogueDiagnosticCodes.unsupportedVersion &&
          entry.paths.source === "/_stats/systemId",
      ),
    );
  });

  it("blocks every F8 blocking synthetic and only those", () => {
    for (const name of [
      "f8a-root-not-object.json",
      "f8b-non-agent-type.json",
      "f8c-system-missing.json",
      "f8d-statistic-missing.json",
      "f8e-wrong-system-id.json",
    ]) {
      const result = importFoundryDeltaGreen(
        encodeJson(readFoundryFixture(`synthetic/${name}`)),
      );
      assert.equal(result.blocked, true, `${name} should block`);
    }
    for (const name of [
      "f8f-legacy-pregen-stats.json",
      "f8g-prepared-projections.json",
      "f8h-unknown-system-path.json",
    ]) {
      const result = importFoundryDeltaGreen(
        encodeJson(readFoundryFixture(`synthetic/${name}`)),
      );
      assert.equal(result.blocked, false, `${name} should import`);
    }
  });
});
