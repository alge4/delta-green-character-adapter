import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planFoundryActorUpdate } from "../src/plan.js";
import { cloneJson } from "../src/util.js";
import {
  BLANK_ACTOR,
  asPlan,
  bindActor,
  entriesOf,
  readCanonicalFixture,
  readFoundryFixture,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

describe("Merge typed custom skills onto a blank Agent", () => {
  it("plans Craft custom skills as Foundry typedSkills (Caleb Electrician/Mechanic/Microelectronics)", () => {
    const snapshot = cloneJson(readCanonicalFixture("f4c-typed-skill-bindings.json")) as {
      agentId: string;
      identity: { name: string };
      skills: { custom: Array<Record<string, unknown>> };
    };
    snapshot.skills.custom.push(
      {
        id: "00000000-0000-4000-8000-000000000021",
        group: "craft",
        label: "Electrician",
        proficiency: 30,
        failureMarked: false,
      },
      {
        id: "00000000-0000-4000-8000-000000000022",
        group: "craft",
        label: "Mechanic",
        proficiency: 30,
        failureMarked: false,
      },
      {
        id: "00000000-0000-4000-8000-000000000023",
        group: "craft",
        label: "Microelectronics",
        proficiency: 60,
        failureMarked: false,
      },
    );

    const target = bindActor(
      withActorName(readFoundryFixture(BLANK_ACTOR), snapshot.identity.name),
      snapshot.agentId,
    );
    const plan = asPlan(
      planFoundryActorUpdate(snapshot, target, {
        createId: sequentialIdFactory(),
        mode: "merge",
      }),
    );

    const typed = entriesOf(plan, (entry) => entry.path.startsWith("/system/typedSkills/"));
    const labels = typed
      .filter((entry) => entry.path.endsWith("/label") && entry.proposed.kind === "scalar")
      .map((entry) => (entry.proposed.kind === "scalar" ? entry.proposed.preview : ""));
    const craftGroups = typed.filter(
      (entry) =>
        entry.path.endsWith("/group") &&
        entry.proposed.kind === "scalar" &&
        entry.proposed.preview === "Craft",
    );

    assert.ok(
      labels.includes("Electrician") &&
        labels.includes("Mechanic") &&
        labels.includes("Microelectronics"),
      `expected Craft labels in typedSkills plan, got ${JSON.stringify(labels)} from ${typed.length} typedSkills entries`,
    );
    assert.equal(craftGroups.length, 3);
    assert.ok(typed.every((entry) => entry.selectedByDefault === true));
  });
});
