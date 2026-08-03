import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { UpdatePlanEntry } from "@delta-green-character-adapter/foundry-update-planner";

import { getByPointer, isRecord } from "../src/paths.js";
import {
  createImportWizardSession,
  isSupportedAgentSheet,
  readModuleOwnedBio,
} from "../src/wizard/index.js";
import { createInMemoryActorRuntime } from "./harness.js";
import {
  BLANK_ACTOR,
  adapterFlags,
  bindActor,
  readFoundryFixture,
  repoRoot,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

const calebBytes = readFileSync(
  `${repoRoot}/fixtures/green-agent-creator/5c9e92d/caleb.json`,
);

const supportedSheet = {
  documentName: "Actor",
  actorType: "agent",
  systemId: "deltagreen",
  systemVersion: "1.7.0",
  coreVersion: "14.365",
} as const;

function blankNamed(name: string): unknown {
  return withActorName(readFoundryFixture(BLANK_ACTOR), name);
}

async function importCalebThroughWizard(
  runtime: ReturnType<typeof createInMemoryActorRuntime>,
  now: string,
): Promise<void> {
  const session = createImportWizardSession({
    runtime,
    sheet: supportedSheet,
    options: {
      createId: sequentialIdFactory(),
      adapterVersion: "0.0.0",
      now,
    },
  });
  session.open();
  session.loadLocalGreenSource({ bytes: calebBytes, fileName: "caleb.json" });
  for (const groupKey of session.view().pendingGroupAcknowledgements) {
    session.acknowledgeGroup(groupKey);
  }
  session.continueToPlan();
  assert.equal(session.view().canApply, true);
  await session.confirmApply();
  assert.equal(session.view().phase, "done");
}

describe("isSupportedAgentSheet", () => {
  it("accepts only exact-runtime Delta Green Agent sheets", () => {
    assert.equal(isSupportedAgentSheet(supportedSheet), true);
    assert.equal(
      isSupportedAgentSheet({ ...supportedSheet, actorType: "npc" }),
      false,
    );
    assert.equal(
      isSupportedAgentSheet({ ...supportedSheet, systemVersion: "1.6.0" }),
      false,
    );
  });
});

describe("createImportWizardSession", () => {
  it("imports local Caleb Green JSON into a blank Agent Actor through verified persistence", async () => {
    const runtime = createInMemoryActorRuntime({
      source: blankNamed("Caleb"),
      gm: true,
      canUpdate: true,
    });
    const session = createImportWizardSession({
      runtime,
      sheet: supportedSheet,
      options: {
        createId: sequentialIdFactory(),
        adapterVersion: "0.0.0",
        now: "2026-08-02T12:00:00.000Z",
      },
    });

    session.open();
    assert.equal(session.view().phase, "source");

    session.loadLocalGreenSource({ bytes: calebBytes, fileName: "caleb.json" });
    const afterSource = session.view();
    assert.equal(afterSource.phase, "diagnostics");
    assert.equal(afterSource.blocked, false);
    assert.ok(afterSource.completeness === "green" || afterSource.completeness === "amber");
    assert.ok(afterSource.diagnostics.length > 0);

    for (const groupKey of afterSource.pendingGroupAcknowledgements) {
      session.acknowledgeGroup(groupKey);
    }
    assert.equal(session.view().canContinueToPlan, true);

    session.continueToPlan();
    const planView = session.view();
    assert.equal(planView.phase, "plan");
    assert.ok(planView.plan !== null);
    assert.equal(
      planView.plan!.entries.some(
        (entry: UpdatePlanEntry) =>
          entry.operation === "bind" &&
          entry.path === `/flags/${ADAPTER_FLAG_NAMESPACE}/agentId`,
      ),
      false,
    );
    assert.ok(planView.plan!.entries.some((entry: UpdatePlanEntry) => entry.selectedByDefault));
    assert.equal(planView.canApply, true);

    await session.confirmApply();
    const done = session.view();
    assert.equal(done.phase, "done");
    assert.equal(done.applyResult?.blocked, false);

    const source = runtime.readActorSource();
    const flags = adapterFlags(source);
    assert.equal(typeof flags.agentId, "string");
    assert.equal(getByPointer(source, "/system/biography/profession"), "Computer Scientist or Engineer");
    assert.equal(getByPointer(source, "/system/statistics/str/value"), 8);
    assert.ok(isRecord(flags.audit));
  });

  it("applies to a differently named open sheet without an Actor Binding gate", async () => {
    const runtime = createInMemoryActorRuntime({
      source: blankNamed("Alge"),
      gm: true,
      canUpdate: true,
    });
    const session = createImportWizardSession({
      runtime,
      sheet: supportedSheet,
      options: {
        createId: sequentialIdFactory(),
        adapterVersion: "0.0.0",
        now: "2026-08-02T12:00:00.000Z",
      },
    });

    session.open();
    session.loadLocalGreenSource({ bytes: calebBytes, fileName: "caleb.json" });
    for (const groupKey of session.view().pendingGroupAcknowledgements) {
      session.acknowledgeGroup(groupKey);
    }
    session.continueToPlan();

    const planView = session.view();
    assert.equal(planView.phase, "plan");
    assert.equal(planView.blocked, false);
    assert.equal(planView.canApply, true);
    assert.equal(
      planView.plan!.entries.some(
        (entry: UpdatePlanEntry) =>
          entry.operation === "bind" &&
          entry.path === `/flags/${ADAPTER_FLAG_NAMESPACE}/agentId`,
      ),
      false,
    );

    await session.confirmApply();
    const done = session.view();
    assert.equal(done.phase, "done");
    assert.equal(done.applyResult?.blocked, false);
    assert.equal(getByPointer(runtime.readActorSource(), "/name"), "Caleb");
    assert.equal(
      getByPointer(runtime.readActorSource(), "/system/biography/profession"),
      "Computer Scientist or Engineer",
    );
  });

  it("applies opted-in mutable campaign state on populated Agent merge", async () => {
    const bootstrap = createInMemoryActorRuntime({
      source: blankNamed("Caleb"),
      gm: true,
    });
    await importCalebThroughWizard(bootstrap, "2026-08-02T12:00:00.000Z");
    const imported = bootstrap.readActorSource();
    const calebAgentId = adapterFlags(imported).agentId as string;

    const populated = structuredClone(imported) as Record<string, unknown>;
    const system = populated.system as Record<string, unknown>;
    system.health = { ...(system.health as object), value: 6 };
    system.wp = { ...(system.wp as object), value: 9 };
    system.sanity = {
      ...(system.sanity as object),
      value: 40,
      currentBreakingPoint: 40,
    };
    const biography = system.biography as Record<string, unknown>;
    biography.profession = "Interim Role";

    const mergeRuntime = createInMemoryActorRuntime({
      source: bindActor(populated, calebAgentId),
      gm: true,
      canUpdate: true,
    });
    const session = createImportWizardSession({
      runtime: mergeRuntime,
      sheet: supportedSheet,
      options: {
        createId: sequentialIdFactory(),
        adapterVersion: "0.0.0",
        now: "2026-08-02T13:00:00.000Z",
      },
    });

    session.open();
    session.loadLocalGreenSource({ bytes: calebBytes, fileName: "caleb.json" });
    for (const groupKey of session.view().pendingGroupAcknowledgements) {
      session.acknowledgeGroup(groupKey);
    }
    session.continueToPlan();
    const plan = session.view().plan!;
    const mutableUpdates = plan.entries.filter(
      (item: UpdatePlanEntry) =>
        item.fieldClass === "mutable" &&
        item.operation === "update" &&
        [
          "/system/health/value",
          "/system/wp/value",
          "/system/sanity/value",
          "/system/sanity/currentBreakingPoint",
        ].includes(item.path),
    );
    assert.ok(mutableUpdates.length >= 3, "expected mutable resource update rows");
    assert.ok(mutableUpdates.every((entry: UpdatePlanEntry) => entry.selectedByDefault === false));
    for (const entry of mutableUpdates) {
      session.setEntrySelected(entry.id, true);
      assert.equal(session.view().selection[entry.id], true);
      assert.equal(
        session.view().plan?.entries.find((item: UpdatePlanEntry) => item.id === entry.id)
          ?.operation,
        "update",
      );
    }

    await session.confirmApply();
    assert.equal(session.view().phase, "done");

    const source = mergeRuntime.readActorSource();
    assert.notEqual(getByPointer(source, "/system/health/value"), 6);
    assert.notEqual(getByPointer(source, "/system/wp/value"), 9);
    assert.notEqual(getByPointer(source, "/system/sanity/value"), 40);
  });

  it("preserves mutable campaign state on populated Agent merge unless opted in", async () => {
    const bootstrap = createInMemoryActorRuntime({
      source: blankNamed("Caleb"),
      gm: true,
    });
    await importCalebThroughWizard(bootstrap, "2026-08-02T12:00:00.000Z");
    const imported = bootstrap.readActorSource();
    const calebAgentId = adapterFlags(imported).agentId as string;

    // Start from the imported Actor, then change mutable campaign state.
    const populated = structuredClone(imported) as Record<string, unknown>;
    const system = populated.system as Record<string, unknown>;
    system.health = { ...(system.health as object), value: 6 };
    system.wp = { ...(system.wp as object), value: 9 };
    system.sanity = {
      ...(system.sanity as object),
      value: 40,
      currentBreakingPoint: 40,
    };
    // Clear profession so merge has a profile write to apply.
    const biography = system.biography as Record<string, unknown>;
    biography.profession = "Interim Role";

    const mergeRuntime = createInMemoryActorRuntime({
      source: bindActor(populated, calebAgentId),
      gm: true,
      canUpdate: true,
    });
    const session = createImportWizardSession({
      runtime: mergeRuntime,
      sheet: supportedSheet,
      options: {
        createId: sequentialIdFactory(),
        adapterVersion: "0.0.0",
        now: "2026-08-02T13:00:00.000Z",
      },
    });

    session.open();
    session.loadLocalGreenSource({ bytes: calebBytes, fileName: "caleb.json" });
    for (const groupKey of session.view().pendingGroupAcknowledgements) {
      session.acknowledgeGroup(groupKey);
    }
    session.continueToPlan();
    const plan = session.view().plan!;
    const mutableEntries = plan.entries.filter(
      (entry: UpdatePlanEntry) => entry.fieldClass === "mutable",
    );
    assert.ok(mutableEntries.length > 0);
    assert.ok(mutableEntries.every((entry: UpdatePlanEntry) => entry.selectedByDefault === false));
    assert.equal(session.view().canApply, true);

    await session.confirmApply();
    assert.equal(session.view().phase, "done");

    const source = mergeRuntime.readActorSource();
    assert.equal(getByPointer(source, "/system/health/value"), 6);
    assert.equal(getByPointer(source, "/system/wp/value"), 9);
    assert.equal(getByPointer(source, "/system/sanity/value"), 40);
    assert.equal(
      getByPointer(source, "/system/biography/profession"),
      "Computer Scientist or Engineer",
    );
  });

  it("blocks apply and forces replan when the Actor fingerprint goes stale", async () => {
    const runtime = createInMemoryActorRuntime({
      source: blankNamed("Caleb"),
      gm: true,
    });
    const session = createImportWizardSession({
      runtime,
      sheet: supportedSheet,
      options: {
        createId: sequentialIdFactory(),
        adapterVersion: "0.0.0",
        now: "2026-08-02T12:00:00.000Z",
      },
    });

    session.open();
    session.loadLocalGreenSource({ bytes: calebBytes, fileName: "caleb.json" });
    for (const groupKey of session.view().pendingGroupAcknowledgements) {
      session.acknowledgeGroup(groupKey);
    }
    session.continueToPlan();
    assert.equal(session.view().canApply, true);

    // Mutate a fingerprint-relevant field without breaking the name match.
    await runtime.updateActor({ "system.biography.employer": "Changed Employer" });

    await session.confirmApply();
    const view = session.view();
    assert.equal(view.phase, "plan");
    assert.equal(view.staleReplanRequired, true);
    assert.ok(view.diagnostics.some((d) => d.code === "adapter.state.stale"));
    assert.equal(view.canApply, false);

    session.acceptReplan();
    assert.equal(session.view().staleReplanRequired, false);
    assert.equal(session.view().canApply, true);
  });

  it("does not expose Handler-only values to non-GM callers", async () => {
    const runtime = createInMemoryActorRuntime({
      source: blankNamed("Caleb"),
      gm: false,
      canUpdate: true,
    });
    const session = createImportWizardSession({
      runtime,
      sheet: supportedSheet,
      options: {
        createId: sequentialIdFactory(),
        adapterVersion: "0.0.0",
        now: "2026-08-02T12:00:00.000Z",
      },
    });

    session.open();
    session.loadLocalGreenSource({ bytes: calebBytes, fileName: "caleb.json" });
    for (const groupKey of session.view().pendingGroupAcknowledgements) {
      session.acknowledgeGroup(groupKey);
    }
    session.continueToPlan();
    const plan = session.view().plan!;
    for (const entry of plan.entries.filter(
      (item: UpdatePlanEntry) => item.fieldClass === "handlerOnly",
    )) {
      assert.equal(entry.selectedByDefault, false);
      assert.ok(
        entry.proposed.kind === "redacted" || entry.proposed.kind === "omitted",
        JSON.stringify(entry.proposed),
      );
    }
    assert.equal(session.view().handlerOnlyVisible, false);
  });

  it("rejects opening on unsupported sheets", () => {
    const runtime = createInMemoryActorRuntime({
      source: blankNamed("Caleb"),
      gm: true,
    });
    const session = createImportWizardSession({
      runtime,
      sheet: { ...supportedSheet, actorType: "npc" },
    });
    assert.throws(() => session.open(), /supported Agent sheet/i);
  });
});

describe("readModuleOwnedBio", () => {
  it("reads unsupported Bio fields from module flags without touching system.biography", () => {
    const actor = {
      system: { biography: { profession: "Agent", age: "30" } },
      flags: {
        [ADAPTER_FLAG_NAMESPACE]: {
          unrepresentable: {
            dateOfBirth: "1987-03-14",
            aliases: ["CJ"],
          },
        },
      },
    };
    const bio = readModuleOwnedBio(actor);
    assert.deepEqual(bio, {
      dateOfBirth: "1987-03-14",
      aliases: ["CJ"],
    });
    assert.equal((actor.system.biography as { profession: string }).profession, "Agent");
  });
});
