export { planFoundryActorUpdate } from "./plan.js";
export type { PlanFoundryActorUpdateOptions } from "./plan.js";

export {
  parseUpdatePlan,
  safeParseUpdatePlan,
  updateFieldClasses,
  updateModes,
  updateScopes,
  planOperations,
} from "./schemas.js";
export type {
  PlanOperation,
  UpdateFieldClass,
  UpdateMode,
  UpdatePlan,
  UpdatePlanEntry,
  UpdateScope,
} from "./schemas.js";

export {
  BLANK_UNTOUCHED_FINGERPRINT,
  isBlankUntouchedTarget,
  targetActorFingerprint,
} from "./blank-fingerprint.js";
