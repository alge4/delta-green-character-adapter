import {
  createOperationResult,
  sortDiagnostics,
  type AdapterDiagnostic,
  type AdapterOperationResult,
} from "@delta-green-character-adapter/adapter-core";
import { createHash } from "node:crypto";

import {
  ADAPTER_FLAG_NAMESPACE,
  EXPORT_ADAPTER_ID,
  EXPORT_CAPABILITY_ID,
  exportFoundryDeltaGreen,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import { safeParseAgentSnapshot } from "@delta-green-character-adapter/character-model";
import { targetActorFingerprint } from "@delta-green-character-adapter/foundry-update-planner";

function createOperationDigest(sourceContentHash: string, capabilityId: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ kind: "create", capabilityId, sourceContentHash }))
    .digest("hex");
  return `sha256:${digest}`;
}

import { writeCompactAuditFlags, type CompactApplyAudit } from "./audit.js";
import { applyDiagnosticCodes, diagnostic } from "./diagnostics.js";
import { isRecord } from "./paths.js";
import type { FoundryWorldRuntime } from "./runtime.js";

export type CreateFoundryActorInput = {
  readonly snapshot: unknown;
  readonly world: FoundryWorldRuntime;
  readonly options?: {
    readonly now?: string;
    readonly adapterVersion?: string;
    readonly createId?: () => string;
  };
};

/**
 * Exact-runtime create from a canonical Agent Snapshot (#25/#27).
 */
export async function createFoundryActor(
  input: CreateFoundryActorInput,
): Promise<AdapterOperationResult> {
  const diagnostics: AdapterDiagnostic[] = [];
  const adapterVersion = input.options?.adapterVersion ?? "0.0.0";
  const now = input.options?.now ?? new Date().toISOString();

  if (!input.world.isGm()) {
    // Creating Actors is typically GM-gated; do not elevate.
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: applyDiagnosticCodes.permissionDenied,
          severity: "fatal",
          message: "Creating a Foundry Actor requires a GM; no privilege elevation is performed.",
          targetPath: "/_id",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  const parsed = safeParseAgentSnapshot(input.snapshot);
  if (!parsed.success) {
    return createOperationResult({
      diagnostics: [
        diagnostic({
          code: applyDiagnosticCodes.malformedStructure,
          severity: "fatal",
          message: `Input does not parse as canonical Agent 1.0.0: ${parsed.error.issues
            .slice(0, 5)
            .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
            .join("; ")}`,
          canonicalPath: "/schemaVersion",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ],
      requiredResolutions: [],
    });
  }

  const exported = exportFoundryDeltaGreen(parsed.data, {
    ...(input.options?.createId !== undefined ? { createId: input.options.createId } : {}),
    adapterVersion,
  });
  diagnostics.push(...exported.diagnostics);
  if (exported.blocked || exported.output === undefined) {
    return createOperationResult({
      diagnostics: sortDiagnostics(diagnostics),
      requiredResolutions: [...exported.requiredResolutions],
    });
  }

  let runtime;
  try {
    runtime = await input.world.createActor(exported.output);
  } catch (error) {
    return createOperationResult({
      diagnostics: sortDiagnostics([
        ...diagnostics,
        diagnostic({
          code: applyDiagnosticCodes.applyFailure,
          severity: "fatal",
          message: `Actor create failed: ${error instanceof Error ? error.message : String(error)}`,
          targetPath: "/_id",
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ]),
      requiredResolutions: [],
    });
  }

  const source = runtime.readActorSource();
  const flags = isRecord(source) && isRecord(source.flags) ? source.flags : {};
  const adapterFlags = isRecord(flags[ADAPTER_FLAG_NAMESPACE])
    ? (flags[ADAPTER_FLAG_NAMESPACE] as Record<string, unknown>)
    : {};
  const bindings = adapterFlags.bindings;

  const audit: CompactApplyAudit = {
    capabilityId: EXPORT_CAPABILITY_ID,
    adapterIds: [EXPORT_ADAPTER_ID],
    adapterVersion,
    sourceContentHash: parsed.data.provenance.contentHash,
    planDigest: createOperationDigest(
      parsed.data.provenance.contentHash,
      EXPORT_CAPABILITY_ID,
    ),
    targetFingerprint: targetActorFingerprint({ type: "agent" }),
    resultFingerprint: targetActorFingerprint(source),
    mode: "create",
    affectedScopes: ["biography"],
    operationCounts: { create: 1 },
    userId: input.world.currentUserId(),
    timestamp: now,
    agentId: parsed.data.agentId,
    ...(bindings !== undefined ? { bindings } : {}),
  };

  try {
    await writeCompactAuditFlags(
      runtime,
      audit,
      bindings !== undefined ? bindings : undefined,
    );
  } catch (error) {
    if (input.world.deleteActor !== undefined) {
      try {
        await input.world.deleteActor(runtime.actorId);
      } catch {
        // Best-effort cleanup only.
      }
    }
    return createOperationResult({
      diagnostics: sortDiagnostics([
        ...diagnostics,
        diagnostic({
          code: applyDiagnosticCodes.applyFailure,
          severity: "fatal",
          message: `Create succeeded but audit flag write failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          targetPath: `/flags/${ADAPTER_FLAG_NAMESPACE}/audit`,
          acknowledgement: { kind: "none" },
          remediations: [{ action: "abort", label: "Abort operation" }],
        }),
      ]),
      requiredResolutions: [],
    });
  }

  const finalSource = runtime.readActorSource();

  return createOperationResult({
    diagnostics: sortDiagnostics(diagnostics),
    requiredResolutions: [],
    output: {
      kind: "created",
      actorId: runtime.actorId,
      audit: {
        ...audit,
        resultFingerprint: targetActorFingerprint(finalSource),
      },
    },
  });
}
