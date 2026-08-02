import * as z from "zod";

import { operationalSeverities } from "./diagnostics.js";
import { isContentHash } from "./hashes.js";

export const fidelityClasses = ["lossless-semantic", "lossy-semantic", "unsupported"] as const;
export type FidelityClass = (typeof fidelityClasses)[number];

export const capabilityDirections = ["import", "export"] as const;
export type CapabilityDirection = (typeof capabilityDirections)[number];

export const pathClassifications = [
  "mapped",
  "derived",
  "ignored",
  "extension",
  "lossy",
  "intentionally_lossy",
  "unsupported",
  "generated",
] as const;
export type PathClassification = (typeof pathClassifications)[number];

const exactIdentitySchema = z.strictObject({
  format: z.string().min(1).optional(),
  schema: z.string().min(1).optional(),
  version: z.string().min(1),
  commit: z.string().min(1).optional(),
  systemCommit: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.format === undefined && value.schema === undefined) {
    ctx.addIssue({
      code: "custom",
      message: "Exact identity requires format or schema.",
      path: ["format"],
    });
  }
});

export const capabilityRecordSchema = z.strictObject({
  id: z.string().min(1),
  adapterId: z.string().min(1),
  adapterVersion: z.string().min(1),
  direction: z.enum(capabilityDirections),
  source: exactIdentitySchema,
  canonical: z.strictObject({
    schema: z.string().min(1),
    version: z.string().min(1),
  }),
  target: exactIdentitySchema.optional(),
  fidelityClass: z.enum(fidelityClasses),
  knownExclusions: z.array(z.string().min(1)),
  evidence: z.strictObject({
    inventory: z.string().min(1),
    knownLoss: z.string().min(1).optional(),
    fixtures: z.array(z.string().min(1)),
    tests: z.array(z.string().min(1)),
  }),
});

export type CapabilityRecord = z.infer<typeof capabilityRecordSchema>;

const inventoryCapabilitySchema = z
  .object({
    id: z.string().min(1),
    direction: z.enum(capabilityDirections),
    adapterId: z.string().min(1),
    source: z.record(z.string(), z.unknown()),
    target: z.record(z.string(), z.unknown()),
    fidelityClass: z.enum(fidelityClasses),
    contract: z.string().min(1).optional(),
    decision: z.string().min(1).optional(),
    knownLoss: z.string().min(1).optional(),
  })
  .passthrough();

const inventoryPathSchema = z
  .object({
    source: z.string().min(1).optional(),
    canonical: z.union([z.string().min(1), z.null()]).optional(),
    target: z.union([z.string().min(1), z.null()]).optional(),
    classification: z.enum(pathClassifications),
    extension: z.string().min(1).optional(),
    transform: z.string().min(1).optional(),
  })
  .passthrough()
  .superRefine((path, ctx) => {
    if (path.source === undefined && path.canonical === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Inventory paths require a source or canonical locator.",
        path: ["source"],
      });
    }
  });

export const mappingInventorySchema = z
  .object({
    capability: inventoryCapabilitySchema,
    paths: z.array(inventoryPathSchema).min(1),
  })
  .passthrough();

export type MappingInventory = z.infer<typeof mappingInventorySchema>;

const knownLossEntrySchema = z
  .object({
    id: z.string().min(1),
    // Foundry manifests use `category`; Green manifests use `severity` for the loss class.
    category: z.string().min(1).optional(),
    severity: z.string().min(1).optional(),
    source: z.union([z.string().min(1), z.null()]),
    canonical: z.union([z.string().min(1), z.null()]),
    loss: z.string().min(1),
    diagnostic: z.enum(operationalSeverities),
    remediation: z.string().min(1),
  })
  .passthrough()
  .superRefine((entry, ctx) => {
    if (entry.category === undefined && entry.severity === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "Known-loss entries require category or severity classification.",
        path: ["category"],
      });
    }
  });

export const knownLossManifestSchema = z.strictObject({
  capability: z.string().min(1),
  fidelityClass: z.enum(fidelityClasses),
  summary: z.string().min(1),
  losses: z.array(knownLossEntrySchema),
  notLosses: z.array(z.string().min(1)).optional(),
});

export type KnownLossManifest = z.infer<typeof knownLossManifestSchema>;

export type FixtureEvidence = {
  readonly path: string;
  readonly checksum: string;
};

export type EvidenceValidationIssue = {
  readonly code: string;
  readonly message: string;
};

export type CapabilityEvidenceBundle = {
  readonly capability: CapabilityRecord;
  readonly inventory: MappingInventory;
  readonly knownLoss?: KnownLossManifest;
  readonly fixtureManifest: readonly FixtureEvidence[];
  readonly presentArtifactPaths: ReadonlySet<string>;
};

export function parseCapabilityRecord(input: unknown): CapabilityRecord {
  return capabilityRecordSchema.parse(input);
}

export function parseMappingInventory(input: unknown): MappingInventory {
  return mappingInventorySchema.parse(input);
}

export function parseKnownLossManifest(input: unknown): KnownLossManifest {
  return knownLossManifestSchema.parse(input);
}

export function validateCapabilityEvidence(
  bundle: CapabilityEvidenceBundle,
): { ok: true } | { ok: false; issues: EvidenceValidationIssue[] } {
  const issues: EvidenceValidationIssue[] = [];
  const { capability, inventory, knownLoss, fixtureManifest, presentArtifactPaths } = bundle;

  if (inventory.capability.id !== capability.id) {
    issues.push({
      code: "capability.inventory.id-mismatch",
      message: `Inventory capability id ${inventory.capability.id} does not match advertised ${capability.id}.`,
    });
  }
  if (inventory.capability.direction !== capability.direction) {
    issues.push({
      code: "capability.inventory.direction-mismatch",
      message: "Inventory direction does not match the advertised capability.",
    });
  }
  if (inventory.capability.fidelityClass !== capability.fidelityClass) {
    issues.push({
      code: "capability.inventory.fidelity-mismatch",
      message: "Inventory fidelity class does not match the advertised capability.",
    });
  }
  if (inventory.capability.adapterId !== capability.adapterId) {
    issues.push({
      code: "capability.inventory.adapter-mismatch",
      message: "Inventory adapter id does not match the advertised capability.",
    });
  }

  const inventoryIdentities = [
    inventory.capability.source,
    inventory.capability.target,
  ];
  const capabilityIdentities = [
    capability.source as Record<string, unknown>,
    capability.canonical as Record<string, unknown>,
    ...(capability.target ? [capability.target as Record<string, unknown>] : []),
  ];
  for (const identity of capabilityIdentities) {
    for (const key of ["version", "commit", "systemCommit"] as const) {
      const value = identity[key];
      if (typeof value !== "string") {
        continue;
      }
      if (!inventoryIdentities.some((candidate) => candidate[key] === value || candidate.version === value)) {
        issues.push({
          code: "capability.inventory.version-mismatch",
          message: `Advertised exact identity ${key}=${value} is absent from the inventory identity records.`,
        });
      }
    }
  }

  if (capability.fidelityClass === "lossy-semantic") {
    if (!capability.evidence.knownLoss) {
      issues.push({
        code: "capability.evidence.known-loss-missing",
        message: "Lossy-semantic capabilities must advertise a known-loss manifest path.",
      });
    }
    if (!knownLoss) {
      issues.push({
        code: "capability.known-loss.missing",
        message: "Lossy-semantic capabilities require a known-loss manifest.",
      });
    } else {
      if (knownLoss.capability !== capability.id) {
        issues.push({
          code: "capability.known-loss.id-mismatch",
          message: "Known-loss capability id does not match the advertised capability.",
        });
      }
      if (knownLoss.fidelityClass !== capability.fidelityClass) {
        issues.push({
          code: "capability.known-loss.fidelity-mismatch",
          message: "Known-loss fidelity class does not match the advertised capability.",
        });
      }
      if (knownLoss.losses.length === 0) {
        issues.push({
          code: "capability.known-loss.empty",
          message: "Lossy-semantic known-loss manifests must enumerate at least one loss.",
        });
      }
    }
  }

  if (capability.fidelityClass === "unsupported") {
    issues.push({
      code: "capability.unsupported.advertised",
      message: "Unsupported capabilities cannot be advertised as releasable evidence bundles.",
    });
  }

  const lossyPaths = inventory.paths.filter(
    (path) => path.classification === "lossy" || path.classification === "intentionally_lossy",
  );
  if (lossyPaths.length > 0 && capability.fidelityClass === "lossless-semantic") {
    issues.push({
      code: "capability.inventory.lossy-under-lossless",
      message: "Lossless-semantic capabilities cannot classify authoritative paths as lossy.",
    });
  }
  if (lossyPaths.length > 0 && !knownLoss) {
    issues.push({
      code: "capability.known-loss.required-for-lossy-paths",
      message: "Inventory lossy paths require a known-loss manifest.",
    });
  }

  const unclassified = inventory.paths.filter((path) => !pathClassifications.includes(path.classification));
  if (unclassified.length > 0) {
    issues.push({
      code: "capability.inventory.unclassified-path",
      message: "Every authoritative inventory path must use a known classification.",
    });
  }

  const requiredArtifacts = [
    capability.evidence.inventory,
    ...(capability.evidence.knownLoss ? [capability.evidence.knownLoss] : []),
    ...capability.evidence.fixtures,
    ...capability.evidence.tests,
  ];
  for (const artifact of requiredArtifacts) {
    if (!presentArtifactPaths.has(artifact)) {
      issues.push({
        code: "capability.evidence.artifact-missing",
        message: `Advertised evidence artifact is missing: ${artifact}`,
      });
    }
  }

  const checksumByPath = new Map(fixtureManifest.map((entry) => [entry.path, entry.checksum]));
  for (const fixturePath of capability.evidence.fixtures) {
    const checksum = checksumByPath.get(fixturePath);
    if (!checksum || !isContentHash(checksum)) {
      issues.push({
        code: "capability.evidence.fixture-checksum-missing",
        message: `Fixture ${fixturePath} lacks a sha256 checksum in the evidence manifest.`,
      });
    }
  }

  if (inventory.capability.knownLoss && capability.evidence.knownLoss) {
    if (inventory.capability.knownLoss !== capability.evidence.knownLoss) {
      issues.push({
        code: "capability.known-loss.path-mismatch",
        message: "Inventory known-loss path does not match the capability evidence path.",
      });
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

