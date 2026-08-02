import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assessCompletenessFromDiagnostics,
  catalogueDiagnosticCodes,
  createUnsupportedVersionDiagnostic,
  createUnverifiedVersionDiagnostic,
  parseAdapterDiagnostic,
  remediationActionKinds,
  safeParseAdapterDiagnostic,
  type AdapterDiagnostic,
} from "../src/index.js";

const baseDiagnostic = {
  code: "adapter.structure.malformed",
  phase: "parse",
  severity: "error",
  completenessImpact: "required",
  localizationKey: "adapter.structure.malformed",
  localizationParameters: { field: "stats" },
  message: "The source structure is malformed.",
  paths: { source: "/stats" },
  valueSummary: { kind: "omitted" },
  remediations: [{ action: "abort", label: "Abort import" }],
  acknowledgement: { kind: "targeted" },
} as const;

describe("adapter diagnostic contract", () => {
  it("accepts every operational severity and completeness impact", () => {
    const cases: Array<Pick<AdapterDiagnostic, "severity" | "completenessImpact" | "acknowledgement" | "remediations">> = [
      {
        severity: "fatal",
        completenessImpact: "required",
        acknowledgement: { kind: "none" },
        remediations: [{ action: "abort", label: "Abort" }],
      },
      {
        severity: "error",
        completenessImpact: "required",
        acknowledgement: { kind: "targeted" },
        remediations: [{ action: "replaceValue", label: "Supply value", parameters: { value: 10 } }],
      },
      {
        severity: "warning",
        completenessImpact: "recommended",
        acknowledgement: { kind: "group", groupKey: "unusual-proficiency" },
        remediations: [{ action: "accept", label: "Accept unusual value" }],
      },
      {
        severity: "information",
        completenessImpact: "none",
        acknowledgement: { kind: "none" },
        remediations: [],
      },
    ];

    for (const variant of cases) {
      const parsed = parseAdapterDiagnostic({ ...baseDiagnostic, ...variant });
      assert.equal(parsed.severity, variant.severity);
      assert.equal(parsed.completenessImpact, variant.completenessImpact);
    }
  });

  it("enforces acknowledgement and remediation policy by severity", () => {
    assert.equal(
      safeParseAdapterDiagnostic({
        ...baseDiagnostic,
        severity: "information",
        completenessImpact: "none",
        acknowledgement: { kind: "group", groupKey: "x" },
        remediations: [],
      }).success,
      false,
    );
    assert.equal(
      safeParseAdapterDiagnostic({
        ...baseDiagnostic,
        severity: "error",
        acknowledgement: { kind: "targeted" },
        remediations: [],
      }).success,
      false,
    );
    assert.equal(
      safeParseAdapterDiagnostic({
        ...baseDiagnostic,
        severity: "fatal",
        acknowledgement: { kind: "targeted" },
        remediations: [{ action: "abort", label: "Abort" }],
      }).success,
      false,
    );
  });

  it("accepts only the closed remediation action set", () => {
    for (const action of remediationActionKinds) {
      const parsed = parseAdapterDiagnostic({
        ...baseDiagnostic,
        remediations: [{ action, label: action }],
      });
      assert.equal(parsed.remediations[0]?.action, action);
    }
    assert.equal(
      safeParseAdapterDiagnostic({
        ...baseDiagnostic,
        remediations: [{ action: "reuseMapping", label: "Reuse" }],
      }).success,
      false,
    );
  });

  it("maps completeness impact independently of severity", () => {
    const diagnostics = [
      parseAdapterDiagnostic({
        ...baseDiagnostic,
        severity: "warning",
        completenessImpact: "required",
        acknowledgement: { kind: "none" },
        remediations: [{ action: "accept", label: "Accept" }],
      }),
      parseAdapterDiagnostic({
        ...baseDiagnostic,
        code: "adapter.data.recommended.missing",
        severity: "error",
        completenessImpact: "none",
        acknowledgement: { kind: "targeted" },
        remediations: [{ action: "useDefault", label: "Use default" }],
      }),
    ];
    assert.equal(assessCompletenessFromDiagnostics(diagnostics), "red");
    assert.equal(
      assessCompletenessFromDiagnostics([
        parseAdapterDiagnostic({
          ...baseDiagnostic,
          severity: "warning",
          completenessImpact: "recommended",
          acknowledgement: { kind: "group", groupKey: "name" },
          remediations: [{ action: "accept", label: "Accept" }],
        }),
      ]),
      "amber",
    );
  });

  it("represents unsupported-version and unverified-version cases as blocking fatals", () => {
    const unsupported = createUnsupportedVersionDiagnostic({
      foundVersion: "1.6.0",
      supportedVersions: ["1.7.0"],
      sourcePath: "/_stats/systemVersion",
    });
    assert.equal(unsupported.code, catalogueDiagnosticCodes.unsupportedVersion);
    assert.equal(unsupported.severity, "fatal");
    assert.equal(unsupported.completenessImpact, "required");

    const unverified = createUnverifiedVersionDiagnostic({
      foundVersion: "1.7.0-rc.1",
      supportedVersions: ["1.7.0"],
    });
    assert.equal(unverified.code, catalogueDiagnosticCodes.unverifiedVersion);
    assert.equal(unverified.severity, "fatal");
  });
});
