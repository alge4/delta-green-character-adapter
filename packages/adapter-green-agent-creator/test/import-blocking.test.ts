import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogueDiagnosticCodes } from "@delta-green-character-adapter/adapter-core";

import { importGreenAgentCreator } from "../src/index.js";

function encode(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

const validStats = { STR: 10, CON: 10, DEX: 10, INT: 10, POW: 10, CHA: 10 };

describe("importGreenAgentCreator blocking rules (#17 inventory)", () => {
  it("blocks when the root is not a JSON object", () => {
    const result = importGreenAgentCreator(encode([]));
    assert.equal(result.blocked, true);
    assert.equal(result.output, undefined);
    assert.ok(result.diagnostics.some((d) => d.code === catalogueDiagnosticCodes.malformedStructure));
  });

  it("blocks when stats is not an object", () => {
    const result = importGreenAgentCreator(encode({ stats: null, skills: [] }));
    assert.equal(result.blocked, true);
    assert.ok(result.diagnostics.some((d) => d.paths.source === "/stats"));
  });

  it("blocks when a required stat is missing or non-finite", () => {
    const missing = importGreenAgentCreator(encode({ stats: { ...validStats, POW: undefined }, skills: [] }));
    assert.equal(missing.blocked, true);

    const nonFinite = importGreenAgentCreator(
      encode({ stats: { ...validStats, CHA: Number.NaN }, skills: [] }),
    );
    assert.equal(nonFinite.blocked, true);
  });

  it("blocks when skills is not an array", () => {
    const result = importGreenAgentCreator(encode({ stats: validStats, skills: {} }));
    assert.equal(result.blocked, true);
    assert.ok(result.diagnostics.some((d) => d.paths.source === "/skills"));
  });
});
