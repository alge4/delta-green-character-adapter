import {
  catalogueDiagnosticCodes,
  parseAdapterDiagnostic,
  type AdapterDiagnostic,
  type OperationalSeverity,
  type ProcessingPhase,
  type RemediationChoice,
  type SafeValueSummary,
} from "@delta-green-character-adapter/adapter-core";

type BuildDiagnosticInput = {
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

export function diagnostic(input: BuildDiagnosticInput): AdapterDiagnostic {
  const severity = input.severity;
  const groupKey = input.groupKey ?? "foundry-deltagreen";
  return parseAdapterDiagnostic({
    code: input.code,
    phase: input.phase ?? "map",
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
    valueSummary: input.valueSummary ?? { kind: "omitted" },
    remediations: [...(input.remediations ?? defaultRemediations(severity))],
    acknowledgement: input.acknowledgement ?? defaultAcknowledgement(severity, groupKey),
    ...(input.technical ? { details: { technical: input.technical } } : {}),
  });
}

export function fatalStructure(message: string, sourcePath: string): AdapterDiagnostic {
  return diagnostic({
    code: catalogueDiagnosticCodes.malformedStructure,
    message,
    severity: "fatal",
    phase: "detect",
    sourcePath,
    completenessImpact: "required",
  });
}

export function warning(
  code: string,
  message: string,
  sourcePath: string,
  extras: Partial<BuildDiagnosticInput> = {},
): AdapterDiagnostic {
  return diagnostic({ code, message, severity: "warning", sourcePath, ...extras });
}

export function information(
  code: string,
  message: string,
  sourcePath: string,
  extras: Partial<BuildDiagnosticInput> = {},
): AdapterDiagnostic {
  return diagnostic({
    code,
    message,
    severity: "information",
    sourcePath,
    completenessImpact: "none",
    ...extras,
  });
}

export function knownLoss(
  severity: "warning" | "information",
  knownLossId: string,
  message: string,
  paths: { readonly sourcePath?: string; readonly canonicalPath?: string; readonly targetPath?: string },
): AdapterDiagnostic {
  return diagnostic({
    code: catalogueDiagnosticCodes.lossDowngrade,
    message,
    severity,
    localizationParameters: { knownLossId },
    ...(paths.sourcePath !== undefined ? { sourcePath: paths.sourcePath } : {}),
    ...(paths.canonicalPath !== undefined ? { canonicalPath: paths.canonicalPath } : {}),
    ...(paths.targetPath !== undefined ? { targetPath: paths.targetPath } : {}),
  });
}

export { catalogueDiagnosticCodes };
