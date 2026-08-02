import {
  parseCapabilityRecord,
  type CapabilityRecord,
} from "@delta-green-character-adapter/adapter-core";

import { ADAPTER_ID, CAPABILITY_ID, SOURCE_FORMAT, SOURCE_VERSION } from "./maps.js";

export const GREEN_INVENTORY_PATH =
  "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/inventory.json";
export const GREEN_KNOWN_LOSS_PATH =
  "docs/mappings/green-agent-creator-5c9e92d-to-canonical-1.0.0/known-loss.json";
export const GREEN_FIXTURE_ROOT = "fixtures/green-agent-creator/5c9e92d";

export function createGreenAgentCreatorCapability(input: {
  readonly adapterVersion?: string;
  readonly fixtures: readonly string[];
  readonly tests: readonly string[];
}): CapabilityRecord {
  return parseCapabilityRecord({
    id: CAPABILITY_ID,
    adapterId: ADAPTER_ID,
    adapterVersion: input.adapterVersion ?? "0.0.0",
    direction: "import",
    source: {
      format: SOURCE_FORMAT,
      version: SOURCE_VERSION,
      commit: "5c9e92d987f1251d62c172209fc53f8e8ac3372b",
    },
    canonical: { schema: "canonical-agent", version: "1.0.0" },
    fidelityClass: "lossy-semantic",
    knownExclusions: [
      "canonical-to-green-export",
      "browser-storage-acquisition",
      "scraping",
      "reusable-mappings",
      "spreadsheet-pdf",
      "ui",
    ],
    evidence: {
      inventory: GREEN_INVENTORY_PATH,
      knownLoss: GREEN_KNOWN_LOSS_PATH,
      fixtures: [...input.fixtures],
      tests: [...input.tests],
    },
  });
}
