import * as z from "zod";

import { jsonValueSchema } from "./json.js";
import { contentHashSchema } from "./hashes.js";
import { remediationActionKinds } from "./diagnostics.js";

const resolutionBindingSchema = z.strictObject({
  operationId: z.string().min(1),
  sourceHash: contentHashSchema,
  target: z
    .strictObject({
      identity: z.string().min(1),
      version: z.string().min(1).optional(),
    })
    .optional(),
});

const typedResolutionSchema = z.strictObject({
  diagnosticFingerprint: contentHashSchema,
  path: z.string().optional(),
  entityId: z.string().min(1).optional(),
  selection: z.strictObject({
    action: z.enum(remediationActionKinds),
    parameters: z.record(z.string(), jsonValueSchema).optional(),
  }),
});

export const resolutionSetSchema = z.strictObject({
  binding: resolutionBindingSchema,
  resolutions: z.array(typedResolutionSchema),
});

export type ResolutionBinding = z.infer<typeof resolutionBindingSchema>;
export type TypedResolution = z.infer<typeof typedResolutionSchema>;
export type ResolutionSet = z.infer<typeof resolutionSetSchema>;

export type ResolutionStalenessContext = {
  readonly operationId: string;
  readonly sourceHash: string;
  readonly target?: {
    readonly identity: string;
    readonly version?: string;
  };
  readonly diagnosticFingerprints: readonly string[];
};

export function parseResolutionSet(input: unknown): ResolutionSet {
  return resolutionSetSchema.parse(input);
}

export function safeParseResolutionSet(input: unknown) {
  return resolutionSetSchema.safeParse(input);
}

export function isResolutionSetStale(
  resolutionSet: ResolutionSet,
  current: ResolutionStalenessContext,
): boolean {
  if (resolutionSet.binding.operationId !== current.operationId) {
    return true;
  }
  if (resolutionSet.binding.sourceHash !== current.sourceHash) {
    return true;
  }
  if (!targetsMatch(resolutionSet.binding.target, current.target)) {
    return true;
  }

  const currentFingerprints = new Set(current.diagnosticFingerprints);
  const boundFingerprints = new Set(
    resolutionSet.resolutions.map((resolution) => resolution.diagnosticFingerprint),
  );
  if (currentFingerprints.size !== boundFingerprints.size) {
    return true;
  }
  for (const fingerprint of boundFingerprints) {
    if (!currentFingerprints.has(fingerprint)) {
      return true;
    }
  }
  return false;
}

function targetsMatch(
  bound: ResolutionBinding["target"],
  current: ResolutionStalenessContext["target"],
): boolean {
  if (bound === undefined && current === undefined) {
    return true;
  }
  if (bound === undefined || current === undefined) {
    return false;
  }
  return bound.identity === current.identity && bound.version === current.version;
}
