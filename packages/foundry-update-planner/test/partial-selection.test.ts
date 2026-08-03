import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdapterDiagnostic } from "@delta-green-character-adapter/adapter-core";

import type { DraftPlanEntry } from "../src/entries.js";
import { applySelectionOverrides } from "../src/selection.js";

describe("Partial selection and dependency validity", () => {
  it("deselects dependent entries when an override clears their dependency", () => {
    const entries: DraftPlanEntry[] = [
      {
        id: "dep",
        operation: "update",
        path: "/name",
        fieldClass: "profile",
        before: { kind: "scalar", typeName: "string", preview: "A" },
        proposed: { kind: "scalar", typeName: "string", preview: "B" },
        selectedByDefault: true,
        selectionReason: "profile",
        dependencies: [],
        beforeValue: "A",
        proposedValue: "B",
      },
      {
        id: "child",
        operation: "update",
        path: "/system/biography/profession",
        fieldClass: "profile",
        before: { kind: "scalar", typeName: "string", preview: "X" },
        proposed: { kind: "scalar", typeName: "string", preview: "Y" },
        selectedByDefault: true,
        selectionReason: "profile",
        dependencies: ["dep"],
        beforeValue: "X",
        proposedValue: "Y",
      },
    ];

    const diagnostics: AdapterDiagnostic[] = [];
    const enabled = applySelectionOverrides(
      entries.map((entry) => ({ ...entry })),
      { dep: true, child: true },
      diagnostics,
    );
    assert.equal(enabled.find((entry) => entry.id === "dep")?.selectedByDefault, true);
    assert.equal(enabled.find((entry) => entry.id === "child")?.selectedByDefault, true);

    const clearedDiagnostics: AdapterDiagnostic[] = [];
    const cleared = applySelectionOverrides(
      entries.map((entry) => ({ ...entry })),
      { dep: false, child: true },
      clearedDiagnostics,
    );
    assert.equal(cleared.find((entry) => entry.id === "dep")?.selectedByDefault, false);
    assert.equal(cleared.find((entry) => entry.id === "child")?.selectedByDefault, false);
    assert.ok(
      clearedDiagnostics.some((entry) => entry.code === "adapter.derived.conflict"),
    );
  });
});
