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
  readonly localizationParameters?: Record<string, string | number | boolean | null>;
  readonly valueSummary?: SafeValueSummary;
  readonly remediations?: readonly RemediationChoice[];
  readonly acknowledgement?: AdapterDiagnostic["acknowledgement"];
  readonly technical?: string;
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

function defaultAcknowledgement(severity: OperationalSeverity): AdapterDiagnostic["acknowledgement"] {
  if (severity === "error") {
    return { kind: "targeted" };
  }
  if (severity === "warning") {
    return { kind: "group", groupKey: "green-agent-creator-import" };
  }
  return { kind: "none" };
}

function defaultRemediations(severity: OperationalSeverity): RemediationChoice[] {
  if (severity === "fatal") {
    return [{ action: "abort", label: "Abort import" }];
  }
  if (severity === "error") {
    return [{ action: "abort", label: "Abort import" }];
  }
  if (severity === "warning") {
    return [{ action: "accept", label: "Accept and continue" }];
  }
  return [];
}

export function diagnostic(input: BuildDiagnosticInput): AdapterDiagnostic {
  const severity = input.severity;
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
    },
    valueSummary: input.valueSummary ?? { kind: "omitted" },
    remediations: [...(input.remediations ?? defaultRemediations(severity))],
    acknowledgement: input.acknowledgement ?? defaultAcknowledgement(severity),
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

export function warning(code: string, message: string, sourcePath: string, extras: Partial<BuildDiagnosticInput> = {}): AdapterDiagnostic {
  return diagnostic({
    code,
    message,
    severity: "warning",
    sourcePath,
    ...extras,
  });
}

export function information(code: string, message: string, sourcePath: string, extras: Partial<BuildDiagnosticInput> = {}): AdapterDiagnostic {
  return diagnostic({
    code,
    message,
    severity: "information",
    sourcePath,
    completenessImpact: "none",
    ...extras,
  });
}

export { catalogueDiagnosticCodes };
