import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSafeValueSummary,
  fingerprintDiagnostic,
  parseAdapterDiagnostic,
  redactForLog,
  sortDiagnostics,
} from "../src/index.js";

function reverseObjectKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => reverseObjectKeys(entry)) as T;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).reverse();
    return Object.fromEntries(entries.map(([key, entry]) => [key, reverseObjectKeys(entry)])) as T;
  }
  return value;
}

function diagnostic(overrides: Record<string, unknown> = {}) {
  return parseAdapterDiagnostic({
    code: "adapter.identity.duplicate",
    phase: "validate",
    severity: "error",
    completenessImpact: "required",
    localizationKey: "adapter.identity.duplicate",
    localizationParameters: {},
    message: "Duplicate identity.",
    paths: { canonical: "/skills/custom/0/id" },
    entity: { id: "0e0b3bdb-a34a-4cfa-bc45-957b7ce661fd", collection: "skills.custom" },
    valueSummary: { kind: "omitted" },
    remediations: [{ action: "skip", label: "Skip duplicate" }],
    acknowledgement: { kind: "targeted" },
    ...overrides,
  });
}

describe("deterministic diagnostics", () => {
  it("fingerprints identically under object-key reordering", () => {
    const original = diagnostic();
    const reordered = parseAdapterDiagnostic(reverseObjectKeys(original));
    assert.equal(fingerprintDiagnostic(original), fingerprintDiagnostic(reordered));
  });

  it("sorts diagnostics by stable identity fields", () => {
    const first = diagnostic({
      code: "adapter.value.normalized",
      severity: "information",
      completenessImpact: "none",
      acknowledgement: { kind: "none" },
      remediations: [],
      paths: { source: "/b" },
      entity: undefined,
      message: "Normalized B.",
    });
    const second = diagnostic({
      code: "adapter.value.coerced",
      severity: "information",
      completenessImpact: "none",
      acknowledgement: { kind: "none" },
      remediations: [],
      paths: { source: "/a" },
      entity: undefined,
      message: "Coerced A.",
    });
    const sorted = sortDiagnostics([first, second]);
    assert.deepEqual(
      sorted.map((item) => item.code),
      ["adapter.value.coerced", "adapter.value.normalized"],
    );
  });
});

describe("privacy-safe summaries", () => {
  it("redacts personal and Handler-only values by default", () => {
    assert.deepEqual(createSafeValueSummary("Casey", "personal"), {
      kind: "redacted",
      reason: "personal",
    });
    assert.deepEqual(createSafeValueSummary("classified note", "handlerOnly"), {
      kind: "redacted",
      reason: "handlerOnly",
    });
    assert.deepEqual(createSafeValueSummary(12, "ordinary"), {
      kind: "scalar",
      typeName: "number",
      preview: "12",
    });
  });

  it("redacts sensitive keys from ordinary log payloads", () => {
    const redacted = redactForLog({
      score: 10,
      name: "Casey",
      dateOfBirth: "1990-01-01",
      notes: { handler: "secret" },
      sourceFragment: { raw: { nested: true } },
    });
    assert.deepEqual(redacted, {
      score: 10,
      name: { redacted: "personal" },
      dateOfBirth: { redacted: "dateOfBirth" },
      notes: { redacted: "notes" },
      sourceFragment: { redacted: "sourceFragment" },
    });
  });
});
