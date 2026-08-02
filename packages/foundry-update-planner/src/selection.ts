import type { AdapterDiagnostic } from "@delta-green-character-adapter/adapter-core";

import { catalogueDiagnosticCodes, diagnostic } from "./diagnostics.js";
import type { DraftPlanEntry } from "./entries.js";
import { updateScopes, type UpdateMode, type UpdatePlanEntry } from "./schemas.js";
import { contentHash } from "./util.js";

export function buildScopes(
  exportDiagnostics: readonly AdapterDiagnostic[],
): Record<string, { complete: boolean; completenessBlockedBy?: string[] }> {
  const blocking = exportDiagnostics
    .filter((entry) => entry.severity === "fatal" || entry.severity === "error")
    .map((entry) => entry.code);
  const complete = blocking.length === 0;
  const scopes: Record<string, { complete: boolean; completenessBlockedBy?: string[] }> = {};
  for (const scope of updateScopes) {
    scopes[scope] = complete
      ? { complete: true }
      : { complete: false, completenessBlockedBy: blocking };
  }
  // Exact export capability proves these Agent scopes when conversion is unblocked.
  return scopes;
}

export function applySelectionOverrides(
  entries: DraftPlanEntry[],
  overrides: Readonly<Record<string, boolean>> | undefined,
  diagnostics: AdapterDiagnostic[],
): DraftPlanEntry[] {
  const selected = new Map(entries.map((entry) => [entry.id, entry.selectedByDefault]));
  if (overrides !== undefined) {
    for (const [id, value] of Object.entries(overrides)) {
      if (selected.has(id)) {
        selected.set(id, value);
      }
    }
  }

  // Dependency validation always runs: dependents cannot stay selected if a dependency is not.
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      if (selected.get(entry.id) !== true) {
        continue;
      }
      for (const dependencyId of entry.dependencies) {
        if (selected.get(dependencyId) !== true) {
          selected.set(entry.id, false);
          if (overrides !== undefined && overrides[entry.id] === true) {
            diagnostics.push(
              diagnostic({
                code: catalogueDiagnosticCodes.derivedConflict,
                severity: "warning",
                message: `Deselected dependency ${dependencyId} forced deselection of ${entry.id}.`,
                targetPath: entry.path,
              }),
            );
          }
          changed = true;
        }
      }
    }
  }

  return entries.map((entry) => ({
    ...entry,
    selectedByDefault: selected.get(entry.id) ?? entry.selectedByDefault,
  }));
}

export function planDigest(entries: readonly UpdatePlanEntry[], mode: UpdateMode): string {
  return contentHash({
    mode,
    entries: entries.map((entry) => ({
      id: entry.id,
      operation: entry.operation,
      path: entry.path,
      selectedByDefault: entry.selectedByDefault,
      fieldClass: entry.fieldClass,
      proposed: entry.proposed,
      before: entry.before,
    })),
  });
}
