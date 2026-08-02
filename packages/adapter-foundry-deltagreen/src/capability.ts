import {
  parseCapabilityRecord,
  type CapabilityRecord,
} from "@delta-green-character-adapter/adapter-core";

import {
  CORE_VERSION,
  EXPORT_ADAPTER_ID,
  EXPORT_CAPABILITY_ID,
  FOUNDRY_FORMAT,
  FOUNDRY_VERSION,
  IMPORT_ADAPTER_ID,
  IMPORT_CAPABILITY_ID,
  SYSTEM_COMMIT,
  SYSTEM_VERSION,
} from "./maps.js";

export const FOUNDRY_IMPORT_INVENTORY_PATH =
  "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/inventory.json";
export const FOUNDRY_IMPORT_KNOWN_LOSS_PATH =
  "docs/mappings/foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0/known-loss.json";
export const FOUNDRY_EXPORT_INVENTORY_PATH =
  "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/inventory.json";
export const FOUNDRY_EXPORT_KNOWN_LOSS_PATH =
  "docs/mappings/canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0/known-loss.json";

export const FOUNDRY_FIXTURE_ROOT = "fixtures/foundry/14.365-deltagreen-1.7.0";
export const CANONICAL_EXPORT_FIXTURE_ROOT = "fixtures/canonical/1.0.0/export-to-foundry";

const SHARED_EXCLUSIONS = [
  "foundry-api-mutation",
  "update-policy-and-ui",
  "adjacent-foundry-or-system-versions",
  "npc-actors",
  "vehicle-actors",
] as const;

type CapabilityInput = {
  readonly adapterVersion?: string;
  readonly fixtures: readonly string[];
  readonly tests: readonly string[];
};

export function createFoundryDeltaGreenImportCapability(input: CapabilityInput): CapabilityRecord {
  return parseCapabilityRecord({
    id: IMPORT_CAPABILITY_ID,
    adapterId: IMPORT_ADAPTER_ID,
    adapterVersion: input.adapterVersion ?? "0.0.0",
    direction: "import",
    source: {
      format: FOUNDRY_FORMAT,
      version: FOUNDRY_VERSION,
      systemCommit: SYSTEM_COMMIT,
    },
    canonical: { schema: "canonical-agent", version: "1.0.0" },
    fidelityClass: "lossy-semantic",
    knownExclusions: [...SHARED_EXCLUSIONS, "canonical-to-foundry-export"],
    evidence: {
      inventory: FOUNDRY_IMPORT_INVENTORY_PATH,
      knownLoss: FOUNDRY_IMPORT_KNOWN_LOSS_PATH,
      fixtures: [...input.fixtures],
      tests: [...input.tests],
    },
  });
}

export function createFoundryDeltaGreenExportCapability(input: CapabilityInput): CapabilityRecord {
  return parseCapabilityRecord({
    id: EXPORT_CAPABILITY_ID,
    adapterId: EXPORT_ADAPTER_ID,
    adapterVersion: input.adapterVersion ?? "0.0.0",
    direction: "export",
    source: { schema: "canonical-agent", version: "1.0.0" },
    canonical: { schema: "canonical-agent", version: "1.0.0" },
    target: {
      format: FOUNDRY_FORMAT,
      version: FOUNDRY_VERSION,
      systemCommit: SYSTEM_COMMIT,
    },
    fidelityClass: "lossy-semantic",
    knownExclusions: [...SHARED_EXCLUSIONS, "foundry-to-canonical-import"],
    evidence: {
      inventory: FOUNDRY_EXPORT_INVENTORY_PATH,
      knownLoss: FOUNDRY_EXPORT_KNOWN_LOSS_PATH,
      fixtures: [...input.fixtures],
      tests: [...input.tests],
    },
  });
}

export const EXACT_TARGET = {
  coreVersion: CORE_VERSION,
  systemVersion: SYSTEM_VERSION,
  systemCommit: SYSTEM_COMMIT,
} as const;
