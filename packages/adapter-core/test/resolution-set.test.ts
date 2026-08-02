import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fingerprintDiagnostic,
  isResolutionSetStale,
  parseAdapterDiagnostic,
  parseResolutionSet,
} from "../src/index.js";

const diagnostic = parseAdapterDiagnostic({
  code: "adapter.data.required.missing",
  phase: "map",
  severity: "error",
  completenessImpact: "required",
  localizationKey: "adapter.data.required.missing",
  localizationParameters: {},
  message: "Required data is missing.",
  paths: { source: "/stats/STR" },
  valueSummary: { kind: "omitted" },
  remediations: [{ action: "replaceValue", label: "Provide STR", parameters: { value: 10 } }],
  acknowledgement: { kind: "targeted" },
});

const fingerprint = fingerprintDiagnostic(diagnostic);
const sourceHash = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("ResolutionSet binding", () => {
  it("binds one-import resolutions to operation, source hash, diagnostic, and target", () => {
    const resolutionSet = parseResolutionSet({
      binding: {
        operationId: "import:green-to-canonical",
        sourceHash,
        target: { identity: "foundry-actor:Actor.abc123", version: "14.365+1.7.0" },
      },
      resolutions: [
        {
          diagnosticFingerprint: fingerprint,
          path: "/stats/STR",
          selection: { action: "replaceValue", parameters: { value: 10 } },
        },
      ],
    });
    assert.equal(resolutionSet.binding.operationId, "import:green-to-canonical");
    assert.equal(resolutionSet.resolutions[0]?.diagnosticFingerprint, fingerprint);
  });

  it("marks a ResolutionSet stale when bound inputs change", () => {
    const resolutionSet = parseResolutionSet({
      binding: {
        operationId: "import:green-to-canonical",
        sourceHash,
        target: { identity: "foundry-actor:Actor.abc123", version: "14.365+1.7.0" },
      },
      resolutions: [
        {
          diagnosticFingerprint: fingerprint,
          selection: { action: "replaceValue", parameters: { value: 10 } },
        },
      ],
    });

    assert.equal(
      isResolutionSetStale(resolutionSet, {
        operationId: "import:green-to-canonical",
        sourceHash,
        target: { identity: "foundry-actor:Actor.abc123", version: "14.365+1.7.0" },
        diagnosticFingerprints: [fingerprint],
      }),
      false,
    );
    assert.equal(
      isResolutionSetStale(resolutionSet, {
        operationId: "import:green-to-canonical",
        sourceHash: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        target: { identity: "foundry-actor:Actor.abc123", version: "14.365+1.7.0" },
        diagnosticFingerprints: [fingerprint],
      }),
      true,
    );
    assert.equal(
      isResolutionSetStale(resolutionSet, {
        operationId: "import:green-to-canonical",
        sourceHash,
        target: { identity: "foundry-actor:Actor.abc123", version: "1.6.0" },
        diagnosticFingerprints: [fingerprint],
      }),
      true,
    );
    assert.equal(
      isResolutionSetStale(resolutionSet, {
        operationId: "import:green-to-canonical",
        sourceHash,
        target: { identity: "foundry-actor:Actor.abc123", version: "14.365+1.7.0" },
        diagnosticFingerprints: [
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        ],
      }),
      true,
    );
    assert.equal(
      isResolutionSetStale(resolutionSet, {
        operationId: "import:green-to-canonical",
        sourceHash,
        target: { identity: "foundry-actor:Actor.abc123", version: "14.365+1.7.0" },
        diagnosticFingerprints: [
          fingerprint,
          "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        ],
      }),
      true,
    );
  });
});
