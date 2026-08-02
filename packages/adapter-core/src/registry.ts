import * as z from "zod";

import {
  validateCapabilityEvidence,
  type CapabilityEvidenceBundle,
  type EvidenceValidationIssue,
} from "./capability.js";

/** Exact directed capabilities advertised by the initial Agent tracer bullet (#8/#29). */
export const VERIFIED_INITIAL_CAPABILITY_IDS = [
  "green-agent-creator-5c9e92d-to-canonical-1.0.0",
  "foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0",
  "canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0",
] as const;

export type VerifiedInitialCapabilityId = (typeof VERIFIED_INITIAL_CAPABILITY_IDS)[number];

const verifiedCapabilityIdSchema = z.enum(VERIFIED_INITIAL_CAPABILITY_IDS);

const registryEntrySchema = z.strictObject({
  id: verifiedCapabilityIdSchema,
  inventory: z.string().min(1),
  knownLoss: z.string().min(1).optional(),
  checksumManifests: z.array(z.string().min(1)).min(1),
});

export const verifiedCapabilityRegistrySchema = z
  .strictObject({
    schemaVersion: z.literal("1.0.0"),
    capabilities: z.array(registryEntrySchema).length(VERIFIED_INITIAL_CAPABILITY_IDS.length),
  })
  .superRefine((registry, ctx) => {
    const ids = registry.capabilities.map((entry) => entry.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        message: "Verified capability registry entries must be unique by id.",
        path: ["capabilities"],
      });
    }
    for (const expected of VERIFIED_INITIAL_CAPABILITY_IDS) {
      if (!unique.has(expected)) {
        ctx.addIssue({
          code: "custom",
          message: `Verified capability registry must include the initial capability ${expected}.`,
          path: ["capabilities"],
        });
      }
    }
  });

export type VerifiedCapabilityRegistry = z.infer<typeof verifiedCapabilityRegistrySchema>;
export type VerifiedCapabilityRegistryEntry = z.infer<typeof registryEntrySchema>;

export type RegistryValidationIssue = EvidenceValidationIssue;

export function parseVerifiedCapabilityRegistry(input: unknown): VerifiedCapabilityRegistry {
  try {
    return verifiedCapabilityRegistrySchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues.map((issue) => issue.message).join("; ");
      throw new Error(
        `Verified capability registry rejected unsupported or malformed entries: ${message}`,
      );
    }
    throw error;
  }
}

export function validateVerifiedCapabilityRegistry(input: {
  readonly registry: VerifiedCapabilityRegistry;
  readonly bundles: readonly CapabilityEvidenceBundle[];
}): { ok: true } | { ok: false; issues: RegistryValidationIssue[] } {
  const issues: RegistryValidationIssue[] = [];
  const bundlesById = new Map(input.bundles.map((bundle) => [bundle.capability.id, bundle]));

  for (const entry of input.registry.capabilities) {
    const bundle = bundlesById.get(entry.id);
    if (bundle === undefined) {
      issues.push({
        code: "registry.bundle.missing",
        message: `Registry capability ${entry.id} has no evidence bundle.`,
      });
      continue;
    }

    if (bundle.capability.evidence.inventory !== entry.inventory) {
      issues.push({
        code: "registry.inventory.path-mismatch",
        message: `Registry inventory path for ${entry.id} does not match the capability evidence path.`,
      });
    }
    if ((bundle.capability.evidence.knownLoss ?? undefined) !== (entry.knownLoss ?? undefined)) {
      issues.push({
        code: "registry.known-loss.path-mismatch",
        message: `Registry known-loss path for ${entry.id} does not match the capability evidence path.`,
      });
    }

    const evidence = validateCapabilityEvidence(bundle);
    if (!evidence.ok) {
      for (const issue of evidence.issues) {
        issues.push({
          code: `registry.evidence.${issue.code}`,
          message: `${entry.id}: ${issue.message}`,
        });
      }
    }
  }

  for (const bundle of input.bundles) {
    if (!VERIFIED_INITIAL_CAPABILITY_IDS.includes(bundle.capability.id as VerifiedInitialCapabilityId)) {
      issues.push({
        code: "registry.bundle.unadvertised",
        message: `Evidence bundle ${bundle.capability.id} is not in the verified initial registry.`,
      });
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
