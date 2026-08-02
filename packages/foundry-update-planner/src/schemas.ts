import * as z from "zod";

import {
  createSafeValueSummary,
  type SafeValueSummary,
} from "@delta-green-character-adapter/adapter-core";

export const updateModes = ["merge", "replace", "synchronize"] as const;
export type UpdateMode = (typeof updateModes)[number];

export const updateFieldClasses = [
  "profile",
  "mutable",
  "foundryOwned",
  "adapterOwned",
  "handlerOnly",
  "systemManaged",
] as const;
export type UpdateFieldClass = (typeof updateFieldClasses)[number];

export const planOperations = ["bind", "add", "update", "preserve", "clear", "remove"] as const;
export type PlanOperation = (typeof planOperations)[number];

export const updateScopes = [
  "biography",
  "skills",
  "bonds",
  "weapons",
  "armour",
  "gear",
  "motivations",
  "disorders",
  "rituals",
  "tomes",
  "mutableResources",
] as const;
export type UpdateScope = (typeof updateScopes)[number];

const safeValueSummarySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("omitted") }),
  z.strictObject({ kind: z.literal("redacted"), reason: z.string().min(1) }),
  z.strictObject({ kind: z.literal("type"), typeName: z.string().min(1) }),
  z.strictObject({ kind: z.literal("scalar"), typeName: z.string().min(1), preview: z.string() }),
]);

const entityReferenceSchema = z.strictObject({
  id: z.string().min(1),
  collection: z.string().min(1).optional(),
});

export const updatePlanEntrySchema = z.strictObject({
  id: z.string().min(1),
  operation: z.enum(planOperations),
  path: z.string().regex(/^(\/([^~]|~0|~1)*)*$/),
  collection: z.string().min(1).optional(),
  entity: entityReferenceSchema.optional(),
  fieldClass: z.enum(updateFieldClasses),
  before: safeValueSummarySchema,
  proposed: safeValueSummarySchema,
  selectedByDefault: z.boolean(),
  selectionReason: z.string().min(1),
  dependencies: z.array(z.string().min(1)),
  diagnosticFingerprints: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/)).optional(),
  scope: z.enum(updateScopes).optional(),
});

export const updatePlanSchema = z.strictObject({
  planId: z.string().min(1),
  mode: z.enum(updateModes),
  capabilityId: z.string().min(1),
  agentId: z.string().uuid(),
  binding: z.strictObject({
    state: z.enum(["bound", "proposed", "unbound", "conflict"]),
    targetActorId: z.string().min(1).optional(),
    targetAgentId: z.string().min(1).optional(),
    proposedByName: z.boolean().optional(),
  }),
  targetFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  sourceContentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  planDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  blankTarget: z.boolean(),
  alreadyUpToDate: z.boolean(),
  scopes: z.record(
    z.string(),
    z.strictObject({
      complete: z.boolean(),
      completenessBlockedBy: z.array(z.string().min(1)).optional(),
    }),
  ),
  permissions: z.strictObject({
    requiresActorUpdate: z.literal(true),
    requiresGmForHandlerContent: z.boolean(),
    /** Replace/Synchronize deletions require a verified recovery snapshot at apply (#10/#27). */
    requiresRecoverySnapshot: z.boolean(),
    callerIsGm: z.boolean().optional(),
  }),
  entries: z.array(updatePlanEntrySchema),
  auditPreview: z.strictObject({
    capabilityId: z.string().min(1),
    adapterIds: z.array(z.string().min(1)),
    sourceContentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    planDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    targetFingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    mode: z.enum(updateModes),
  }),
});

export type UpdatePlanEntry = z.infer<typeof updatePlanEntrySchema>;
export type UpdatePlan = z.infer<typeof updatePlanSchema>;

export function parseUpdatePlan(input: unknown): UpdatePlan {
  return updatePlanSchema.parse(input);
}

export function safeParseUpdatePlan(input: unknown) {
  return updatePlanSchema.safeParse(input);
}

export function summarizeValue(
  value: unknown,
  fieldClass: UpdateFieldClass,
): SafeValueSummary {
  if (fieldClass === "handlerOnly") {
    return createSafeValueSummary(value, "handlerOnly");
  }
  return createSafeValueSummary(value, "ordinary");
}
