import * as z from "zod";

import type { JsonValue } from "@delta-green-character-adapter/character-model";

import { jsonValueSchema } from "./json.js";

export const operationalSeverities = ["fatal", "error", "warning", "information"] as const;
export type OperationalSeverity = (typeof operationalSeverities)[number];

export const diagnosticCompletenessImpacts = ["required", "recommended", "none"] as const;
export type DiagnosticCompletenessImpact = (typeof diagnosticCompletenessImpacts)[number];

export const processingPhases = [
  "detect",
  "parse",
  "normalize",
  "map",
  "validate",
  "plan",
  "apply",
  "verify",
] as const;
export type ProcessingPhase = (typeof processingPhases)[number];

export const remediationActionKinds = [
  "accept",
  "keepTarget",
  "chooseTarget",
  "replaceValue",
  "skip",
  "useDefault",
  "preserveExtension",
  "abort",
] as const;
export type RemediationActionKind = (typeof remediationActionKinds)[number];

/** Shared minimum diagnostic catalogue from issue #6. */
export const catalogueDiagnosticCodes = {
  unsupportedVersion: "adapter.version.unsupported",
  unverifiedVersion: "adapter.version.unverified",
  malformedStructure: "adapter.structure.malformed",
  malformedValue: "adapter.value.malformed",
  missingRequired: "adapter.data.required.missing",
  missingRecommended: "adapter.data.recommended.missing",
  safeCoercion: "adapter.value.coerced",
  safeDefault: "adapter.value.defaulted",
  safeNormalization: "adapter.value.normalized",
  derivedConflict: "adapter.derived.conflict",
  preservedUnknown: "adapter.extension.preserved-unknown",
  lossDowngrade: "adapter.fidelity.loss",
  formatDowngrade: "adapter.fidelity.format-downgrade",
  duplicateIdentity: "adapter.identity.duplicate",
  ambiguousIdentity: "adapter.identity.ambiguous",
  mutableStateReplacement: "adapter.state.mutable-replacement",
  staleState: "adapter.state.stale",
  applyFailure: "adapter.apply.failure",
  verificationMismatch: "adapter.verify.mismatch",
} as const;

const rfc6901Path = z.string().regex(/^(\/([^~]|~0|~1)*)*$/, "Expected an RFC 6901 JSON Pointer");

const pathPointerSchema = z.strictObject({
  source: rfc6901Path.optional(),
  canonical: rfc6901Path.optional(),
  target: rfc6901Path.optional(),
});

const entityReferenceSchema = z.strictObject({
  id: z.string().min(1),
  collection: z.string().min(1).optional(),
});

const safeValueSummarySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("omitted") }),
  z.strictObject({ kind: z.literal("redacted"), reason: z.string().min(1) }),
  z.strictObject({ kind: z.literal("type"), typeName: z.string().min(1) }),
  z.strictObject({ kind: z.literal("scalar"), typeName: z.string().min(1), preview: z.string() }),
]);

export const remediationChoiceSchema = z.strictObject({
  action: z.enum(remediationActionKinds),
  label: z.string().min(1),
  preview: z.string().optional(),
  parameters: z.record(z.string(), jsonValueSchema).optional(),
});

const acknowledgementSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({ kind: z.literal("targeted") }),
  z.strictObject({ kind: z.literal("group"), groupKey: z.string().min(1) }),
]);

export const adapterDiagnosticSchema = z
  .strictObject({
    code: z.string().min(1).regex(/^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/, "Expected a namespaced diagnostic code"),
    phase: z.enum(processingPhases),
    severity: z.enum(operationalSeverities),
    completenessImpact: z.enum(diagnosticCompletenessImpacts),
    localizationKey: z.string().min(1),
    localizationParameters: z.record(z.string(), jsonValueSchema),
    message: z.string().min(1),
    paths: pathPointerSchema,
    entity: entityReferenceSchema.optional(),
    valueSummary: safeValueSummarySchema,
    remediations: z.array(remediationChoiceSchema),
    acknowledgement: acknowledgementSchema,
    details: z
      .strictObject({
        correlationId: z.string().min(1).optional(),
        technical: z.string().min(1).optional(),
      })
      .optional(),
  })
  .superRefine((diagnostic, ctx) => {
    if (diagnostic.severity === "fatal" && diagnostic.acknowledgement.kind !== "none") {
      ctx.addIssue({
        code: "custom",
        message: "Fatal diagnostics block and cannot be acknowledged away.",
        path: ["acknowledgement"],
      });
    }
    if (diagnostic.severity === "error" && diagnostic.acknowledgement.kind !== "targeted") {
      ctx.addIssue({
        code: "custom",
        message: "Error diagnostics require targeted remediation or override.",
        path: ["acknowledgement"],
      });
    }
    if (diagnostic.severity === "error" && diagnostic.remediations.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Error diagnostics must offer at least one remediation action.",
        path: ["remediations"],
      });
    }
    if (diagnostic.severity === "warning" && diagnostic.acknowledgement.kind === "targeted") {
      ctx.addIssue({
        code: "custom",
        message: "Warnings use none or homogeneous group acknowledgement, not targeted override.",
        path: ["acknowledgement"],
      });
    }
    if (diagnostic.severity === "information" && diagnostic.acknowledgement.kind !== "none") {
      ctx.addIssue({
        code: "custom",
        message: "Information diagnostics never require acknowledgement.",
        path: ["acknowledgement"],
      });
    }
    if (
      diagnostic.paths.source === undefined &&
      diagnostic.paths.canonical === undefined &&
      diagnostic.paths.target === undefined &&
      diagnostic.entity === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: "A diagnostic must locate at least one path or stable entity reference.",
        path: ["paths"],
      });
    }
  });

export type AdapterDiagnostic = z.infer<typeof adapterDiagnosticSchema>;
export type RemediationChoice = z.infer<typeof remediationChoiceSchema>;
export type AcknowledgementRequirement = z.infer<typeof acknowledgementSchema>;
export type SafeValueSummary = z.infer<typeof safeValueSummarySchema>;
export type PathPointer = z.infer<typeof pathPointerSchema>;
export type EntityReference = z.infer<typeof entityReferenceSchema>;

export function parseAdapterDiagnostic(input: unknown): AdapterDiagnostic {
  return adapterDiagnosticSchema.parse(input);
}

export function safeParseAdapterDiagnostic(input: unknown) {
  return adapterDiagnosticSchema.safeParse(input);
}

export function assessCompletenessFromDiagnostics(
  diagnostics: readonly AdapterDiagnostic[],
): "green" | "amber" | "red" {
  if (diagnostics.some((item) => item.completenessImpact === "required")) {
    return "red";
  }
  if (diagnostics.some((item) => item.completenessImpact === "recommended")) {
    return "amber";
  }
  return "green";
}

export function isOperationBlocked(diagnostics: readonly AdapterDiagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === "fatal");
}

function createVersionDiagnostic(input: {
  readonly code: string;
  readonly message: string;
  readonly phase?: ProcessingPhase;
  readonly sourcePath?: string;
  readonly foundVersion: string;
  readonly supportedVersions: readonly string[];
  readonly correlationId?: string;
}): AdapterDiagnostic {
  return parseAdapterDiagnostic({
    code: input.code,
    phase: input.phase ?? "detect",
    severity: "fatal",
    completenessImpact: "required",
    localizationKey: input.code,
    localizationParameters: {
      foundVersion: input.foundVersion,
      supportedVersions: [...input.supportedVersions],
    },
    message: input.message,
    paths: { source: input.sourcePath ?? "" },
    valueSummary: { kind: "scalar", typeName: "string", preview: input.foundVersion },
    remediations: [{ action: "abort", label: "Abort" }],
    acknowledgement: { kind: "none" },
    ...(input.correlationId ? { details: { correlationId: input.correlationId } } : {}),
  });
}

export function createUnsupportedVersionDiagnostic(input: {
  readonly phase?: ProcessingPhase;
  readonly sourcePath?: string;
  readonly foundVersion: string;
  readonly supportedVersions: readonly string[];
  readonly correlationId?: string;
}): AdapterDiagnostic {
  return createVersionDiagnostic({
    ...input,
    code: catalogueDiagnosticCodes.unsupportedVersion,
    message: `Unsupported source version ${input.foundVersion}.`,
  });
}

export function createUnverifiedVersionDiagnostic(input: {
  readonly phase?: ProcessingPhase;
  readonly sourcePath?: string;
  readonly foundVersion: string;
  readonly supportedVersions: readonly string[];
  readonly correlationId?: string;
}): AdapterDiagnostic {
  return createVersionDiagnostic({
    ...input,
    code: catalogueDiagnosticCodes.unverifiedVersion,
    message: `Unverified source version ${input.foundVersion}.`,
  });
}

export type { JsonValue };
