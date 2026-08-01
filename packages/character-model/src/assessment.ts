import { STANDARD_SKILL_IDS, type AgentSnapshot } from "./schemas.js";

export type DiagnosticSeverity = "error" | "warning" | "information";
export type CompletenessImpact = "red" | "amber" | "none";

export interface AgentDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly severity: DiagnosticSeverity;
  readonly completenessImpact: CompletenessImpact;
  readonly message: string;
}

export interface CompletenessAssessment {
  readonly completeness: "green" | "amber" | "red";
  readonly diagnostics: readonly AgentDiagnostic[];
}

const statisticNames = [
  "strength",
  "constitution",
  "dexterity",
  "intelligence",
  "power",
  "charisma",
] as const;

export function assessAgentSnapshot(snapshot: AgentSnapshot): CompletenessAssessment {
  const diagnostics: AgentDiagnostic[] = [];

  for (const name of statisticNames) {
    if (snapshot.statistics[name] === undefined) {
      diagnostics.push(missing(`statistics.${name}`, "A primary statistic is required for mathematics."));
    }
  }

  for (const name of ["hitPoints", "willpower", "sanity", "breakingPoint"] as const) {
    if (snapshot.resources[name] === undefined) {
      diagnostics.push(missing(`resources.${name}`, "A core resource is required for mathematics."));
    }
  }

  for (const skillId of STANDARD_SKILL_IDS) {
    if (snapshot.skills.standard[skillId] === undefined) {
      diagnostics.push({
        code: "agent.skills.standard.missing",
        path: `skills.standard.${skillId}`,
        severity: "error",
        completenessImpact: "red",
        message: "A Standard Skill proficiency is required for normal play.",
      });
    }
  }

  if (!snapshot.identity.name) {
    diagnostics.push({
      code: "agent.identity.name.missing",
      path: "identity.name",
      severity: "warning",
      completenessImpact: "amber",
      message: "The Agent has no display name.",
    });
  }

  if (!snapshot.biography.profession) {
    diagnostics.push({
      code: "agent.biography.profession.missing",
      path: "biography.profession",
      severity: "warning",
      completenessImpact: "amber",
      message: "The Agent has no profession.",
    });
  }

  addResourceWarnings(snapshot, diagnostics);
  addIdentityDiagnostics(snapshot, diagnostics);
  addReferenceDiagnostics(snapshot, diagnostics);

  const completeness = diagnostics.some((item) => item.completenessImpact === "red")
    ? "red"
    : diagnostics.some((item) => item.completenessImpact === "amber")
      ? "amber"
      : "green";

  return { completeness, diagnostics };
}

function missing(path: string, message: string): AgentDiagnostic {
  return {
    code: "agent.mathematics.required-field.missing",
    path,
    severity: "error",
    completenessImpact: "red",
    message,
  };
}

function addResourceWarnings(snapshot: AgentSnapshot, diagnostics: AgentDiagnostic[]): void {
  for (const name of ["hitPoints", "willpower", "sanity"] as const) {
    const resource = snapshot.resources[name];
    if (resource && resource.current > resource.maximum) {
      diagnostics.push({
        code: "agent.resource.current-above-maximum",
        path: `resources.${name}.current`,
        severity: "warning",
        completenessImpact: "none",
        message: "The explicit current value exceeds the explicit maximum and was preserved.",
      });
    }
  }
}

function addIdentityDiagnostics(snapshot: AgentSnapshot, diagnostics: AgentDiagnostic[]): void {
  const seen = new Set<string>([snapshot.agentId]);
  const collections = [
    snapshot.skills.custom,
    snapshot.skills.specialTraining,
    snapshot.relationships.bonds,
    snapshot.psychology.motivations,
    snapshot.psychology.disorders,
    snapshot.psychology.adaptations,
    snapshot.inventory.weapons,
    snapshot.inventory.armor,
    snapshot.inventory.gear,
    snapshot.inventory.rituals,
    snapshot.inventory.tomes,
  ];

  for (const collection of collections) {
    for (const entry of collection) {
      if (seen.has(entry.id)) {
        diagnostics.push({
          code: "agent.identity.duplicate",
          path: "id",
          severity: "error",
          completenessImpact: "red",
          message: `Canonical identity ${entry.id} is used more than once.`,
        });
      }
      seen.add(entry.id);
    }
  }
}

function addReferenceDiagnostics(snapshot: AgentSnapshot, diagnostics: AgentDiagnostic[]): void {
  const disorderIds = new Set(snapshot.psychology.disorders.map((entry) => entry.id));
  for (const [index, motivation] of snapshot.psychology.motivations.entries()) {
    if (motivation.linkedDisorderId && !disorderIds.has(motivation.linkedDisorderId)) {
      diagnostics.push({
        code: "agent.psychology.motivation.disorder-reference-missing",
        path: `psychology.motivations.${index}.linkedDisorderId`,
        severity: "error",
        completenessImpact: "red",
        message: "The motivation references a disorder that is not present in this snapshot.",
      });
    }
  }

  const customSkillIds = new Set(snapshot.skills.custom.map((entry) => entry.id));
  for (const [index, training] of snapshot.skills.specialTraining.entries()) {
    if (training.uses.kind === "customSkill" && !customSkillIds.has(training.uses.skillId)) {
      diagnostics.push({
        code: "agent.skills.special-training.custom-skill-reference-missing",
        path: `skills.specialTraining.${index}.uses.skillId`,
        severity: "error",
        completenessImpact: "red",
        message: "The Special Training references a Custom Skill that is not present in this snapshot.",
      });
    }
  }
}
