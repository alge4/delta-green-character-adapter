import * as z from "zod";

import type { CompletenessAssessment } from "@delta-green-character-adapter/validation";

import { jsonValueSchema } from "./json.js";
import { contentHashSchema } from "./hashes.js";
import {
  adapterDiagnosticSchema,
  assessCompletenessFromDiagnostics,
  isOperationBlocked,
  remediationChoiceSchema,
  type AdapterDiagnostic,
} from "./diagnostics.js";

const resolutionRequirementSchema = z.strictObject({
  diagnosticFingerprint: contentHashSchema,
  path: z.string().optional(),
  entityId: z.string().min(1).optional(),
  selectionOptions: z.array(remediationChoiceSchema),
});

export const adapterOperationResultSchema = z.strictObject({
  blocked: z.boolean(),
  completeness: z.enum(["green", "amber", "red"]),
  diagnostics: z.array(adapterDiagnosticSchema),
  requiredResolutions: z.array(resolutionRequirementSchema),
  output: jsonValueSchema.optional(),
  plan: jsonValueSchema.optional(),
});

export type ResolutionRequirement = z.infer<typeof resolutionRequirementSchema>;
export type AdapterOperationResult = z.infer<typeof adapterOperationResultSchema>;
export type OperationCompleteness = CompletenessAssessment["completeness"];

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value)) {
    deepFreeze(entry);
  }
  return Object.freeze(value);
}

export function createOperationResult(input: {
  readonly diagnostics: readonly AdapterDiagnostic[];
  readonly requiredResolutions: readonly ResolutionRequirement[];
  readonly output?: unknown;
  readonly plan?: unknown;
}): AdapterOperationResult {
  const completeness: OperationCompleteness = assessCompletenessFromDiagnostics(input.diagnostics);
  const result = parseOperationResult({
    blocked: isOperationBlocked(input.diagnostics),
    completeness,
    diagnostics: [...input.diagnostics],
    requiredResolutions: [...input.requiredResolutions],
    ...(input.output !== undefined ? { output: input.output } : {}),
    ...(input.plan !== undefined ? { plan: input.plan } : {}),
  });
  return deepFreeze(result);
}

export function parseOperationResult(input: unknown): AdapterOperationResult {
  return adapterOperationResultSchema.parse(input);
}

export function safeParseOperationResult(input: unknown) {
  return adapterOperationResultSchema.safeParse(input);
}
