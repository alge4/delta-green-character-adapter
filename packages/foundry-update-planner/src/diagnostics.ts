import {
  catalogueDiagnosticCodes,
  fingerprintDiagnostic,
  parseAdapterDiagnostic,
  type AdapterDiagnostic,
  type OperationalSeverity,
  type RemediationChoice,
  type SafeValueSummary,
} from "@delta-green-character-adapter/adapter-core";

type BuildInput = {
  readonly code: string;
  readonly message: string;
  readonly severity: OperationalSeverity;
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
  const groupKey = input.groupKey ?? "foundry-update-planner";
  return parseAdapterDiagnostic({
    code: input.code,
    phase: "plan",
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

export { catalogueDiagnosticCodes, fingerprintDiagnostic };

export const plannerDiagnosticCodes = {
  ...catalogueDiagnosticCodes,
  bindingRequired: "adapter.identity.binding-required",
  bindingConflict: "adapter.identity.binding-conflict",
  bindingProposed: "adapter.identity.binding-proposed",
  clearWarned: "adapter.state.clear-warned",
  incompleteScope: "adapter.scope.incomplete",
  protectedRemoval: "adapter.state.protected-removal",
  permissionDenied: "adapter.permission.denied",
  alreadyUpToDate: "adapter.plan.already-up-to-date",
  recoveryRequired: "adapter.plan.recovery-required",
} as const;
