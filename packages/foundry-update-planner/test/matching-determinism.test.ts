import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ADAPTER_FLAG_NAMESPACE,
  exportFoundryDeltaGreen,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";

import { matchCollections, type DesiredItem, type TargetItem } from "../src/matching.js";
import { planFoundryActorUpdate } from "../src/plan.js";
import { cloneJson, isRecord } from "../src/util.js";
import {
  BLANK_ACTOR,
  asPlan,
  bindActor,
  readCanonicalFixture,
  readFoundryFixture,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

describe("Collection matching and determinism", () => {
  it("never matches across subtypes or by array position", () => {
    const desired: DesiredItem[] = [
      {
        index: 0,
        canonicalId: "11111111-1111-4111-8111-111111111111",
        name: "Alpha",
        type: "bond",
        system: { description: "", score: 5 },
        flags: {},
        semanticKey: "bond\0alpha\0",
        systemManaged: false,
      },
    ];
    const targets: TargetItem[] = [
      {
        index: 0,
        id: "WeaponFirst00001",
        name: "Alpha",
        type: "weapon",
        system: { description: "" },
        flags: {},
        systemManaged: false,
        semanticKey: "weapon\0alpha\0",
      },
      {
        index: 1,
        id: "BondSecond000001",
        name: "Alpha",
        type: "bond",
        system: { description: "", score: 3 },
        flags: {},
        systemManaged: false,
        semanticKey: "bond\0alpha\0",
      },
    ];
    const matches = matchCollections(desired, targets);
    const matched = matches.find((entry) => entry.kind === "uniqueSemantic");
    assert.ok(matched && matched.kind === "uniqueSemantic");
    assert.equal(matched.target.id, "BondSecond000001");
  });

  it("errors on ambiguous same-subtype semantic identity", () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json") as Record<string, unknown>;
    const agentId = snapshot.agentId as string;
    snapshot.relationships = {
      bonds: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          name: "Twin",
          score: 5,
          damagedSinceLastHomeScene: false,
        },
      ],
    };

    const blank = readFoundryFixture(BLANK_ACTOR);
    const target = bindActor(withActorName(blank, "Export Subject"), agentId) as Record<
      string,
      unknown
    >;
    const items = Array.isArray(target.items) ? [...target.items] : [];
    for (const id of ["BondA00000000001", "BondB00000000001"]) {
      items.push({
        _id: id,
        name: "Twin",
        type: "bond",
        system: {
          description: "",
          score: 4,
          relationship: "",
          hasBeenDamagedSinceLastHomeScene: false,
        },
        flags: {},
      });
    }
    target.items = items;
    const system = isRecord(target.system) ? { ...target.system } : {};
    system.biography = { profession: "Agent" };
    target.system = system;

    const result = planFoundryActorUpdate(snapshot, target, {
      createId: sequentialIdFactory(),
    });
    assert.ok(result.diagnostics.some((entry) => entry.code === "adapter.identity.ambiguous"));
    assert.ok(result.requiredResolutions.length >= 1);
  });

  it("is deterministic under identical inputs", () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const blank = readFoundryFixture(BLANK_ACTOR);
    const target = bindActor(
      withActorName(blank, "Export Subject"),
      (snapshot as { agentId: string }).agentId,
    );
    const left = asPlan(
      planFoundryActorUpdate(snapshot, target, { createId: sequentialIdFactory() }),
    );
    const right = asPlan(
      planFoundryActorUpdate(cloneJson(snapshot), cloneJson(target), {
        createId: sequentialIdFactory(),
      }),
    );
    assert.equal(left.planDigest, right.planDigest);
    assert.equal(left.targetFingerprint, right.targetFingerprint);
    assert.deepEqual(
      left.entries.map((entry) => [entry.operation, entry.path, entry.selectedByDefault]),
      right.entries.map((entry) => [entry.operation, entry.path, entry.selectedByDefault]),
    );
  });

  it("marks unchanged reapply as already up to date", () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const exported = exportFoundryDeltaGreen(snapshot, { createId: sequentialIdFactory() });
    assert.equal(exported.blocked, false);
    const actor = cloneJson(exported.output) as Record<string, unknown>;
    actor._id = "ActorAlready0001";
    const flags = isRecord(actor.flags) ? { ...actor.flags } : {};
    flags[ADAPTER_FLAG_NAMESPACE] = {
      ...(isRecord(flags[ADAPTER_FLAG_NAMESPACE])
        ? (flags[ADAPTER_FLAG_NAMESPACE] as Record<string, unknown>)
        : {}),
      agentId: (snapshot as { agentId: string }).agentId,
    };
    actor.flags = flags;

    const result = planFoundryActorUpdate(snapshot, actor, {
      createId: sequentialIdFactory(),
    });
    const plan = asPlan(result);
    assert.equal(plan.alreadyUpToDate, true);
    assert.ok(
      result.diagnostics.some((entry) => entry.code === "adapter.plan.already-up-to-date"),
    );
  });
});
