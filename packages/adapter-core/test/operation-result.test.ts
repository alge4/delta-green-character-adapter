import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOperationResult,
  fingerprintDiagnostic,
  parseAdapterDiagnostic,
  parseOperationResult,
} from "../src/index.js";

const warning = parseAdapterDiagnostic({
  code: "adapter.fidelity.loss",
  phase: "map",
  severity: "warning",
  completenessImpact: "none",
  localizationKey: "adapter.fidelity.loss",
  localizationParameters: { lossId: "unarmed-combat-not-standard" },
  message: "Unarmed Combat is preserved as a Custom Skill.",
  paths: { source: "/system/skills/unarmed_combat", canonical: "/skills/custom" },
  valueSummary: { kind: "type", typeName: "number" },
  remediations: [{ action: "accept", label: "Accept Custom Skill" }],
  acknowledgement: { kind: "group", groupKey: "known-loss" },
});

const fatal = parseAdapterDiagnostic({
  code: "adapter.version.unsupported",
  phase: "detect",
  severity: "fatal",
  completenessImpact: "required",
  localizationKey: "adapter.version.unsupported",
  localizationParameters: { foundVersion: "9.9.9", supportedVersions: ["1.7.0"] },
  message: "Unsupported source version.",
  paths: { source: "/_stats/systemVersion" },
  valueSummary: { kind: "scalar", typeName: "string", preview: "9.9.9" },
  remediations: [{ action: "abort", label: "Abort" }],
  acknowledgement: { kind: "none" },
});

describe("immutable adapter operation results", () => {
  it("returns diagnostics, completeness, output, and required resolutions together", () => {
    const result = createOperationResult({
      diagnostics: [warning],
      output: { agentId: "0f52c9e8-4e11-4cbc-a89b-e2e504481832" },
      requiredResolutions: [
        {
          diagnosticFingerprint: fingerprintDiagnostic(warning),
          selectionOptions: warning.remediations,
        },
      ],
    });

    assert.equal(result.blocked, false);
    assert.equal(result.completeness, "green");
    assert.deepEqual(result.output, { agentId: "0f52c9e8-4e11-4cbc-a89b-e2e504481832" });
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.requiredResolutions.length, 1);
  });

  it("blocks on fatal diagnostics while still returning available diagnostics", () => {
    const result = createOperationResult({
      diagnostics: [fatal, warning],
      output: undefined,
      requiredResolutions: [],
    });
    assert.equal(result.blocked, true);
    assert.equal(result.completeness, "red");
    assert.equal(result.output, undefined);
  });

  it("freezes operation results as immutable snapshots", () => {
    const result = createOperationResult({
      diagnostics: [warning],
      requiredResolutions: [],
    });
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.diagnostics));
    assert.throws(() => {
      (result as { blocked: boolean }).blocked = false;
    });
  });

  it("runtime-validates operation result shape", () => {
    const parsed = parseOperationResult({
      blocked: false,
      completeness: "amber",
      diagnostics: [warning],
      requiredResolutions: [],
      output: { ok: true },
    });
    assert.equal(parsed.completeness, "amber");
  });
});
