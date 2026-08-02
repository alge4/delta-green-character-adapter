import {
  catalogueDiagnosticCodes,
  parseAdapterDiagnostic,
  type AdapterDiagnostic,
  type OperationalSeverity,
  type ProcessingPhase,
  type RemediationChoice,
  type SafeValueSummary,
} from "@delta-green-character-adapter/adapter-core";

type BuildInput = {
  readonly code: string;
  readonly message: string;
  readonly severity: OperationalSeverity;
  readonly phase?: ProcessingPhase;
  readonly completenessImpact?: "required" | "recommended" | "none";
  readonly sourcePath?: string;
  readonly canonicalPath?: string;
  readonly targetPath?: string;
  readonly localizationParameters?: Record<string, string | number | boolean | null>;
  readonly valueSummary?: SafeValueSummary;
  readonly remediations?: readonly RemediationChoice[];
  readonly acknowledgement?: AdapterDiagnostic["acknowledgement"];
  readonly entity?: { id: string; collection?: string };
  readonly technical?: string;
  readonly groupKey?: string;
};

function defaultCompleteness(severity: OperationalSeverity): "required" | "recommended" | "none" {
  if (severity === "fatal" || severity === "error") {
    return "required";
  }
  if (severity === "warning") {
    return "recommended";
  }
  return "none";
}

function defaultAcknowledgement(
  severity: OperationalSeverity,
  groupKey: string,
): AdapterDiagnostic["acknowledgement"] {
  if (severity === "error") {
    return { kind: "targeted" };
  }
  if (severity === "warning") {
    return { kind: "group", groupKey };
  }
  return { kind: "none" };
}

function defaultRemediations(severity: OperationalSeverity): RemediationChoice[] {
  if (severity === "fatal" || severity === "error") {
    return [{ action: "abort", label: "Abort operation" }];
  }
  if (severity === "warning") {
    return [{ action: "accept", label: "Accept and continue" }];
  }
  return [];
}

export function diagnostic(input: BuildInput): AdapterDiagnostic {
  const severity = input.severity;
  const groupKey = input.groupKey ?? "foundry-module-apply";
  return parseAdapterDiagnostic({
    code: input.code,
    phase: input.phase ?? "apply",
    severity,
    completenessImpact: input.completenessImpact ?? defaultCompleteness(severity),
    localizationKey: input.code,
    localizationParameters: input.localizationParameters ?? {},
    message: input.message,
    paths: {
      ...(input.sourcePath !== undefined ? { source: input.sourcePath } : {}),
      ...(input.canonicalPath !== undefined ? { canonical: input.canonicalPath } : {}),
      ...(input.targetPath !== undefined ? { target: input.targetPath } : {}),
    },
    ...(input.entity !== undefined ? { entity: input.entity } : {}),
    valueSummary: input.valueSummary ?? { kind: "omitted" },
    remediations: [...(input.remediations ?? defaultRemediations(severity))],
    acknowledgement: input.acknowledgement ?? defaultAcknowledgement(severity, groupKey),
    ...(input.technical ? { details: { technical: input.technical } } : {}),
  });
}

export const applyDiagnosticCodes = {
  ...catalogueDiagnosticCodes,
  permissionDenied: "adapter.permission.denied",
  applyFailure: catalogueDiagnosticCodes.applyFailure,
  verificationMismatch: catalogueDiagnosticCodes.verificationMismatch,
  staleState: catalogueDiagnosticCodes.staleState,
} as const;

export const MANUAL_RECOVERY_DISCLOSURE =
  "Automatic rollback was incomplete. An authorized recovery snapshot is available for manual restore only. Handler-only content may be present; treat the snapshot as sensitive and never store it in Actor flags.";
