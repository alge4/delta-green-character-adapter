/**
 * PROTOTYPE fixture for issue #9.
 * In-memory only — answers "what should the sheet integration look/feel like",
 * not adapter correctness.
 */

export type Completeness = "green" | "amber" | "red";
export type Severity = "fatal" | "error" | "warning" | "information";
export type CompletenessImpact = "required" | "recommended" | "none";
export type RemediationAction =
  | "accept"
  | "keep-target"
  | "choose-target"
  | "replace-value"
  | "skip"
  | "use-default"
  | "preserve-extension"
  | "abort";

export type Diagnostic = {
  id: string;
  code: string;
  severity: Severity;
  completenessImpact: CompletenessImpact;
  message: string;
  path: string;
  remediation: RemediationAction[];
  acknowledgementRequired: boolean;
};

export type PlanEntry = {
  id: string;
  operation: "bind" | "add" | "update" | "preserve" | "clear";
  path: string;
  before: string;
  proposed: string;
  updateClass: "profile" | "mutable" | "foundry-owned" | "adapter-owned";
  selectedByDefault: boolean;
  reason: string;
};

export type FlowPhase =
  | "idle"
  | "source-picked"
  | "diagnosing"
  | "remediating"
  | "reviewing-plan"
  | "applied";

export type PrototypeState = {
  variant: string;
  phase: FlowPhase;
  actorName: string;
  profession: string;
  boundAgentId: string | null;
  completeness: Completeness;
  moduleOwned: {
    dateOfBirth: string | null;
  };
  sourceLabel: string | null;
  diagnostics: Diagnostic[];
  resolutions: Record<string, RemediationAction>;
  plan: PlanEntry[];
  planSelection: Record<string, boolean>;
  lastAction: string;
};

export const SAMPLE_SOURCE = {
  label: "Caleb (Green Agent Creator → canonical)",
  agentId: "agent_caleb_01",
  dateOfBirth: "1987-03-14",
};

export const INITIAL_DIAGNOSTICS: Diagnostic[] = [
  {
    id: "d1",
    code: "dgca.typedSkill.ambiguous",
    severity: "error",
    completenessImpact: "none",
    message: "Two typed skills match Craft (Locksmith). Choose the target entry.",
    path: "/skills/custom/craft-locksmith",
    remediation: ["choose-target", "skip", "abort"],
    acknowledgementRequired: true,
  },
  {
    id: "d2",
    code: "dgca.mutable.hpDiffers",
    severity: "warning",
    completenessImpact: "none",
    message: "Imported HP (8) differs from current Actor HP (6). Mutable state is preserved by default.",
    path: "/resources/hp/current",
    remediation: ["keep-target", "replace-value", "accept"],
    acknowledgementRequired: false,
  },
  {
    id: "d3",
    code: "dgca.biography.dobUnsupported",
    severity: "information",
    completenessImpact: "recommended",
    message: "Date of birth has no upstream schema field; will store under module-owned flags.",
    path: "/biography/dateOfBirth",
    remediation: ["preserve-extension", "skip"],
    acknowledgementRequired: false,
  },
  {
    id: "d4",
    code: "dgca.skill.recommendedMissing",
    severity: "warning",
    completenessImpact: "recommended",
    message: "Occult proficiency omitted in source; Agent remains playable.",
    path: "/skills/standard/occult",
    remediation: ["use-default", "skip", "accept"],
    acknowledgementRequired: false,
  },
];

export const INITIAL_PLAN: PlanEntry[] = [
  {
    id: "p1",
    operation: "bind",
    path: "flags.deltaGreenCharacterAdapter.agentId",
    before: "(unbound)",
    proposed: SAMPLE_SOURCE.agentId,
    updateClass: "adapter-owned",
    selectedByDefault: true,
    reason: "Name match proposed; user confirms binding",
  },
  {
    id: "p2",
    operation: "update",
    path: "system.biography.profession",
    before: "Federal Agent",
    proposed: "Special Agent, FBI",
    updateClass: "profile",
    selectedByDefault: true,
    reason: "Profile/capability updates by default",
  },
  {
    id: "p3",
    operation: "preserve",
    path: "system.health.value",
    before: "6",
    proposed: "8",
    updateClass: "mutable",
    selectedByDefault: false,
    reason: "Mutable campaign state preserved unless reviewed",
  },
  {
    id: "p4",
    operation: "preserve",
    path: "system.skills.alertness.failure",
    before: "true",
    proposed: "false",
    updateClass: "mutable",
    selectedByDefault: false,
    reason: "Skill-failure marks are campaign state",
  },
  {
    id: "p5",
    operation: "update",
    path: "flags.deltaGreenCharacterAdapter.moduleOwned.dateOfBirth",
    before: "(none)",
    proposed: SAMPLE_SOURCE.dateOfBirth,
    updateClass: "adapter-owned",
    selectedByDefault: true,
    reason: "Upstream schema has no DOB; module-owned storage",
  },
  {
    id: "p6",
    operation: "add",
    path: "items[bond]/Bond — Elena Voss",
    before: "(absent)",
    proposed: "score 7",
    updateClass: "profile",
    selectedByDefault: true,
    reason: "Unmatched imported entry proposed as addition",
  },
];

export function createInitialState(variant: string): PrototypeState {
  return {
    variant,
    phase: "idle",
    actorName: "CALEB, JOHN",
    profession: "Federal Agent",
    boundAgentId: null,
    completeness: "amber",
    moduleOwned: { dateOfBirth: null },
    sourceLabel: null,
    diagnostics: [],
    resolutions: {},
    plan: [],
    planSelection: {},
    lastAction: "mounted",
  };
}

export function deriveCompleteness(
  diagnostics: Diagnostic[],
  resolutions: Record<string, RemediationAction>,
): Completeness {
  const active = diagnostics.filter((d) => resolutions[d.id] !== "skip");
  if (active.some((d) => d.completenessImpact === "required")) return "red";
  if (active.some((d) => d.completenessImpact === "recommended")) return "amber";
  return "green";
}

export function pickSource(state: PrototypeState): PrototypeState {
  const resolutions: Record<string, RemediationAction> = {};
  for (const d of INITIAL_DIAGNOSTICS) {
    if (d.remediation[0]) resolutions[d.id] = d.remediation[0];
  }
  const planSelection: Record<string, boolean> = {};
  for (const p of INITIAL_PLAN) planSelection[p.id] = p.selectedByDefault;

  return {
    ...state,
    phase: "remediating",
    sourceLabel: SAMPLE_SOURCE.label,
    diagnostics: INITIAL_DIAGNOSTICS,
    resolutions,
    plan: INITIAL_PLAN,
    planSelection,
    completeness: deriveCompleteness(INITIAL_DIAGNOSTICS, resolutions),
    lastAction: "picked sample source",
  };
}

export function setResolution(
  state: PrototypeState,
  diagnosticId: string,
  action: RemediationAction,
): PrototypeState {
  const resolutions = { ...state.resolutions, [diagnosticId]: action };
  const nextPhase =
    state.phase === "remediating" || state.phase === "diagnosing"
      ? "remediating"
      : state.phase;
  return {
    ...state,
    resolutions,
    completeness: deriveCompleteness(state.diagnostics, resolutions),
    phase: nextPhase,
    lastAction: `resolved ${diagnosticId} → ${action}`,
  };
}

export function togglePlanEntry(state: PrototypeState, planId: string): PrototypeState {
  const current = state.planSelection[planId] ?? false;
  return {
    ...state,
    planSelection: { ...state.planSelection, [planId]: !current },
    phase: "reviewing-plan",
    lastAction: `toggled plan ${planId} → ${!current}`,
  };
}

export function advanceToPlan(state: PrototypeState): PrototypeState {
  const blocking = state.diagnostics.filter(
    (d) =>
      (d.severity === "fatal" || d.severity === "error") &&
      d.acknowledgementRequired &&
      !state.resolutions[d.id],
  );
  if (blocking.length > 0) {
    return {
      ...state,
      lastAction: `blocked: ${blocking.length} unresolved error(s)`,
    };
  }
  if (state.resolutions.d1 === "abort") {
    return {
      ...state,
      phase: "idle",
      sourceLabel: null,
      diagnostics: [],
      plan: [],
      lastAction: "aborted import",
    };
  }
  return {
    ...state,
    phase: "reviewing-plan",
    lastAction: "opened Update Plan review",
  };
}

export function applyPlan(state: PrototypeState): PrototypeState {
  const dobSelected = state.planSelection.p5;
  const professionSelected = state.planSelection.p2;
  const bindSelected = state.planSelection.p1;
  return {
    ...state,
    phase: "applied",
    boundAgentId: bindSelected ? SAMPLE_SOURCE.agentId : state.boundAgentId,
    profession: professionSelected ? "Special Agent, FBI" : state.profession,
    moduleOwned: {
      dateOfBirth: dobSelected ? SAMPLE_SOURCE.dateOfBirth : state.moduleOwned.dateOfBirth,
    },
    completeness: deriveCompleteness(state.diagnostics, state.resolutions),
    lastAction: "applied Update Plan (in-memory stub)",
  };
}

export function resetFlow(state: PrototypeState): PrototypeState {
  return {
    ...createInitialState(state.variant),
    lastAction: "reset flow",
  };
}
