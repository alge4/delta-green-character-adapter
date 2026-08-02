import {
  fingerprintDiagnostic,
  type AdapterDiagnostic,
  type ResolutionRequirement,
} from "@delta-green-character-adapter/adapter-core";
import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { AgentSnapshot } from "@delta-green-character-adapter/character-model";

import { desiredItemsFromSnapshotAndExport } from "./desired-items.js";
import { catalogueDiagnosticCodes, diagnostic, plannerDiagnosticCodes } from "./diagnostics.js";
import { optionalScope, pushEntry, type DraftPlanEntry } from "./entries.js";
import { scopeForItemType } from "./field-classes.js";
import { matchCollections, readTargetItems } from "./matching.js";
import { diffScalarField } from "./scalars.js";
import type { UpdateMode } from "./schemas.js";
import { deepEqual, pointer } from "./util.js";

export function planCollections(
  entries: DraftPlanEntry[],
  snapshot: AgentSnapshot,
  desiredActor: unknown,
  targetActor: unknown,
  ctx: {
    readonly createId: () => string;
    readonly mode: UpdateMode;
    readonly blankTarget: boolean;
    readonly mutableFresh: boolean;
    readonly bound: boolean;
    readonly callerIsGm: boolean;
    readonly bindEntryId?: string;
    readonly scopes: Record<string, { complete: boolean; completenessBlockedBy?: string[] }>;
  },
  diagnostics: AdapterDiagnostic[],
  requiredResolutions: ResolutionRequirement[],
): void {
  const desiredItems = desiredItemsFromSnapshotAndExport(snapshot, desiredActor);
  const targetItems = readTargetItems(targetActor);
  const matches = matchCollections(desiredItems, targetItems);
  const deps = ctx.bindEntryId !== undefined ? [ctx.bindEntryId] : [];

  for (const match of matches) {
    if (match.kind === "ambiguous") {
      const diag = diagnostic({
        code: catalogueDiagnosticCodes.ambiguousIdentity,
        severity: "error",
        message: `Ambiguous ${match.desired.type} match for "${match.desired.name}"; array position is never used.`,
        targetPath: "/items",
        canonicalPath: `/inventory/${match.desired.type}`,
        entity: { id: match.desired.canonicalId, collection: match.desired.type },
        remediations: match.candidates.map((candidate) => ({
          action: "chooseTarget" as const,
          label: `Bind to Item ${candidate.id}`,
          parameters: { targetItemId: candidate.id },
        })),
      });
      diagnostics.push(diag);
      requiredResolutions.push({
        diagnosticFingerprint: fingerprintDiagnostic(diag),
        entityId: match.desired.canonicalId,
        selectionOptions: diag.remediations,
      });
      continue;
    }

    if (match.kind === "addition") {
      const scope = scopeForItemType(match.desired.type);
      pushEntry(entries, {
        id: ctx.createId(),
        operation: "add",
        path: "/items",
        fieldClass: match.desired.systemManaged ? "systemManaged" : "profile",
        beforeValue: undefined,
        proposedValue: {
          name: match.desired.name,
          type: match.desired.type,
          system: match.desired.system,
          flags: {
            ...match.desired.flags,
            [ADAPTER_FLAG_NAMESPACE]: { canonicalId: match.desired.canonicalId },
          },
        },
        mode: ctx.mode,
        blankTarget: ctx.blankTarget,
        mutableFresh: ctx.mutableFresh,
        bound: ctx.bound,
        removalEligible: false,
        callerIsGm: ctx.callerIsGm,
        collection: match.desired.type,
        entity: { id: match.desired.canonicalId, collection: match.desired.type },
        ...optionalScope(scope),
        dependencies: deps,
        ...(ctx.blankTarget
          ? {
              selectionReasonOverride:
                "Blank fingerprint initialization adds missing Item types without mapping warnings.",
            }
          : {}),
      });
      continue;
    }

    if (match.kind === "unmatchedTarget") {
      const scope = scopeForItemType(match.target.type);
      const scopeComplete = scope !== undefined && ctx.scopes[scope]?.complete === true;
      const eligible =
        !match.target.systemManaged &&
        match.target.boundCanonicalId !== undefined &&
        scopeComplete &&
        (ctx.mode === "replace" || ctx.mode === "synchronize");

      if (ctx.mode === "merge") {
        pushEntry(entries, {
          id: ctx.createId(),
          operation: "preserve",
          path: pointer("items", match.target.id),
          fieldClass: match.target.systemManaged ? "systemManaged" : "profile",
          beforeValue: { name: match.target.name, type: match.target.type },
          proposedValue: { name: match.target.name, type: match.target.type },
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          removalEligible: false,
          callerIsGm: ctx.callerIsGm,
          collection: match.target.type,
          entity: {
            id: match.target.boundCanonicalId ?? match.target.id,
            collection: match.target.type,
          },
          ...optionalScope(scope),
          dependencies: deps,
          selectionReasonOverride: "Merge preserves unmatched existing entries.",
        });
        continue;
      }

      if (match.target.systemManaged) {
        const diag = diagnostic({
          code: plannerDiagnosticCodes.protectedRemoval,
          severity: "warning",
          message: "System-managed Unarmed Attack is protected from default deletion.",
          targetPath: pointer("items", match.target.id),
          entity: { id: match.target.id, collection: "weapon" },
        });
        diagnostics.push(diag);
        pushEntry(entries, {
          id: ctx.createId(),
          operation: "remove",
          path: pointer("items", match.target.id),
          fieldClass: "systemManaged",
          beforeValue: { name: match.target.name, type: match.target.type },
          proposedValue: undefined,
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          removalEligible: false,
          callerIsGm: ctx.callerIsGm,
          collection: match.target.type,
          entity: { id: match.target.id, collection: match.target.type },
          ...optionalScope(scope),
          dependencies: deps,
          diagnosticFingerprints: [fingerprintDiagnostic(diag)],
        });
        continue;
      }

      if (!scopeComplete) {
        diagnostics.push(
          diagnostic({
            code: plannerDiagnosticCodes.incompleteScope,
            severity: "warning",
            message: `Scope ${scope ?? match.target.type} is not proven complete; absence cannot authorize removal.`,
            targetPath: pointer("items", match.target.id),
          }),
        );
        pushEntry(entries, {
          id: ctx.createId(),
          operation: "preserve",
          path: pointer("items", match.target.id),
          fieldClass: "profile",
          beforeValue: { name: match.target.name, type: match.target.type },
          proposedValue: { name: match.target.name, type: match.target.type },
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          removalEligible: false,
          callerIsGm: ctx.callerIsGm,
          collection: match.target.type,
          entity: { id: match.target.id, collection: match.target.type },
          ...optionalScope(scope),
          dependencies: deps,
        });
        continue;
      }

      pushEntry(entries, {
        id: ctx.createId(),
        operation: "remove",
        path: pointer("items", match.target.id),
        fieldClass: "profile",
        beforeValue: { name: match.target.name, type: match.target.type, system: match.target.system },
        proposedValue: undefined,
        mode: ctx.mode,
        blankTarget: ctx.blankTarget,
        mutableFresh: ctx.mutableFresh,
        bound: ctx.bound,
        removalEligible: eligible,
        callerIsGm: ctx.callerIsGm,
        collection: match.target.type,
        entity: {
          id: match.target.boundCanonicalId ?? match.target.id,
          collection: match.target.type,
        },
        ...optionalScope(scope),
        dependencies: deps,
        ...(!eligible
          ? {
              selectedOverride: false,
              selectionReasonOverride:
                "Unbound pre-existing entries are offered only as individually deselected removals.",
            }
          : {}),
      });
      continue;
    }

    // matched bound / provenance / uniqueSemantic
    if (match.kind === "uniqueSemantic") {
      diagnostics.push(
        diagnostic({
          code: catalogueDiagnosticCodes.safeNormalization,
          severity: "warning",
          message: `Unique semantic match for ${match.desired.type} "${match.desired.name}" proposes binding.`,
          targetPath: pointer("items", match.target.id),
          entity: { id: match.desired.canonicalId, collection: match.desired.type },
        }),
      );
      pushEntry(entries, {
        id: ctx.createId(),
        operation: "bind",
        path: pointer("items", match.target.id, "flags", ADAPTER_FLAG_NAMESPACE, "canonicalId"),
        fieldClass: "adapterOwned",
        beforeValue: match.target.boundCanonicalId,
        proposedValue: match.desired.canonicalId,
        mode: ctx.mode,
        blankTarget: ctx.blankTarget,
        mutableFresh: ctx.mutableFresh,
        bound: ctx.bound,
        removalEligible: false,
        callerIsGm: ctx.callerIsGm,
        collection: match.desired.type,
        entity: { id: match.desired.canonicalId, collection: match.desired.type },
        ...optionalScope(scopeForItemType(match.desired.type)),
        dependencies: deps,
        selectedOverride: true,
        selectionReasonOverride:
          "Unique subtype plus normalized semantic identity proposes a binding.",
      });
    }

    const itemPath = pointer("items", match.target.id);
    const scope = scopeForItemType(match.desired.type);
    if (match.desired.name !== match.target.name) {
      diffScalarField(
        entries,
        {
          createId: ctx.createId,
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          callerIsGm: ctx.callerIsGm,
          path: `${itemPath}/name`,
          beforeValue: match.target.name,
          proposedValue: match.desired.name,
          dependencies: deps,
        },
        diagnostics,
      );
    }

    for (const key of new Set([
      ...Object.keys(match.target.system),
      ...Object.keys(match.desired.system),
    ])) {
      const beforeValue = match.target.system[key];
      const proposedValue = match.desired.system[key];
      if (deepEqual(beforeValue, proposedValue)) {
        continue;
      }
      // Nested objects (sanity blocks) compared as wholes for planner entries.
      diffScalarField(
        entries,
        {
          createId: ctx.createId,
          mode: ctx.mode,
          blankTarget: ctx.blankTarget,
          mutableFresh: ctx.mutableFresh,
          bound: ctx.bound,
          callerIsGm: ctx.callerIsGm,
          path: `${itemPath}/system/${key}`,
          beforeValue,
          proposedValue,
          dependencies: deps,
        },
        diagnostics,
      );
    }
    void scope;
  }
}
