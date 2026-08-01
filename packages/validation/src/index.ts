import {
  STANDARD_SKILL_IDS,
  type AgentSnapshot,
} from "@delta-green-character-adapter/character-model";

export type DiagnosticSeverity = "error" | "warning" | "information";
export type CompletenessImpact = "red" | "amber" | "none";
export type AgentDiagnosticCode =
  | "agent.mathematics.required-field.missing"
  | "agent.skills.standard.missing"
  | "agent.skills.proficiency.unusual"
  | "agent.identity.name.missing"
  | "agent.biography.profession.missing"
  | "agent.resource.current-above-maximum"
  | "agent.identity.duplicate"
  | "agent.psychology.motivation.disorder-reference-missing"
  | "agent.skills.special-training.custom-skill-reference-missing";

export interface AgentDiagnostic {
  readonly code: AgentDiagnosticCode;
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
      diagnostics.push(
        missingMathematicalInput(
          `statistics.${name}`,
          "A primary statistic is required for mathematics.",
        ),
      );
    }
  }

  for (const name of ["hitPoints", "willpower", "sanity", "breakingPoint"] as const) {
    if (snapshot.resources[name] === undefined) {
      diagnostics.push(
        missingMathematicalInput(
          `resources.${name}`,
          "A core resource is required for mathematics.",
        ),
      );
    }
  }

  for (const skillId of STANDARD_SKILL_IDS) {
    const skill = snapshot.skills.standard[skillId];
    if (skill === undefined) {
      diagnostics.push({
        code: "agent.skills.standard.missing",
        path: `skills.standard.${skillId}`,
        severity: "error",
        completenessImpact: "red",
        message: "A Standard Skill proficiency is required for normal play.",
      });
    } else {
      addUnusualProficiencyDiagnostic(skill.proficiency, `skills.standard.${skillId}.proficiency`, diagnostics);
    }
  }

  for (const [index, skill] of snapshot.skills.custom.entries()) {
    addUnusualProficiencyDiagnostic(skill.proficiency, `skills.custom.${index}.proficiency`, diagnostics);
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

function missingMathematicalInput(path: string, message: string): AgentDiagnostic {
  return {
    code: "agent.mathematics.required-field.missing",
    path,
    severity: "error",
    completenessImpact: "red",
    message,
  };
}

function addUnusualProficiencyDiagnostic(
  proficiency: number,
  path: string,
  diagnostics: AgentDiagnostic[],
): void {
  if (proficiency < 0 || proficiency > 100) {
    diagnostics.push({
      code: "agent.skills.proficiency.unusual",
      path,
      severity: "warning",
      completenessImpact: "none",
      message: "The explicit proficiency is outside the usual 0–100 range and was preserved.",
    });
  }
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
        message: "The motivation references a Disorder that is not present in this snapshot.",
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
