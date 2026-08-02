export {
  adapterDiagnosticSchema,
  assessCompletenessFromDiagnostics,
  catalogueDiagnosticCodes,
  createUnsupportedVersionDiagnostic,
  createUnverifiedVersionDiagnostic,
  diagnosticCompletenessImpacts,
  isOperationBlocked,
  operationalSeverities,
  parseAdapterDiagnostic,
  processingPhases,
  remediationActionKinds,
  remediationChoiceSchema,
  safeParseAdapterDiagnostic,
} from "./diagnostics.js";
export type {
  AcknowledgementRequirement,
  AdapterDiagnostic,
  DiagnosticCompletenessImpact,
  EntityReference,
  OperationalSeverity,
  PathPointer,
  ProcessingPhase,
  RemediationActionKind,
  RemediationChoice,
  SafeValueSummary,
} from "./diagnostics.js";

export {
  createOperationResult,
  parseOperationResult,
  safeParseOperationResult,
} from "./operation-result.js";
export type {
  AdapterOperationResult,
  OperationCompleteness,
  ResolutionRequirement,
} from "./operation-result.js";

export {
  fingerprintDiagnostic,
  sortDiagnostics,
} from "./fingerprint.js";

export {
  createSafeValueSummary,
  redactForLog,
} from "./privacy.js";
export type { SensitiveFieldKind } from "./privacy.js";

export {
  isResolutionSetStale,
  parseResolutionSet,
  safeParseResolutionSet,
} from "./resolution-set.js";
export type {
  ResolutionBinding,
  ResolutionSet,
  ResolutionStalenessContext,
  TypedResolution,
} from "./resolution-set.js";

export {
  capabilityDirections,
  capabilityRecordSchema,
  fidelityClasses,
  parseCapabilityRecord,
  parseKnownLossManifest,
  parseMappingInventory,
  pathClassifications,
  validateCapabilityEvidence,
} from "./capability.js";
export type {
  CapabilityDirection,
  CapabilityEvidenceBundle,
  CapabilityRecord,
  EvidenceValidationIssue,
  FidelityClass,
  FixtureEvidence,
  KnownLossManifest,
  MappingInventory,
  PathClassification,
} from "./capability.js";

export {
  parseVerifiedCapabilityRegistry,
  validateVerifiedCapabilityRegistry,
  VERIFIED_INITIAL_CAPABILITY_IDS,
  verifiedCapabilityRegistrySchema,
} from "./registry.js";
export type {
  RegistryValidationIssue,
  VerifiedCapabilityRegistry,
  VerifiedCapabilityRegistryEntry,
  VerifiedInitialCapabilityId,
} from "./registry.js";
