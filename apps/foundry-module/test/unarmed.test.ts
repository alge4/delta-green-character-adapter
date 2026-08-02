import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  UNARMED_ATTACK_ITEM_NAME,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import { planFoundryActorUpdate } from "@delta-green-character-adapter/foundry-update-planner";

import { applyFoundryActorUpdate } from "../src/apply.js";
import { createFoundryActor } from "../src/create.js";
import { isRecord } from "../src/paths.js";
import { createInMemoryActorRuntime, createInMemoryWorld } from "./harness.js";
import {
  BLANK_ACTOR,
  asPlan,
  bindActor,
  readCanonicalFixture,
  readFoundryFixture,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

function countUnarmed(actor: unknown): number {
  if (!isRecord(actor) || !Array.isArray(actor.items)) {
    return 0;
  }
  return actor.items.filter(
    (item) => isRecord(item) && item.name === UNARMED_ATTACK_ITEM_NAME && item.type === "weapon",
  ).length;
}

describe("Unarmed Attack duplication", () => {
  it("blank merge apply does not create a second Unarmed Attack", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const agentId = (snapshot as { agentId: string }).agentId;
    const target = bindActor(
      withActorName(readFoundryFixture(BLANK_ACTOR), "Export Subject"),
      agentId,
    );
    assert.equal(countUnarmed(target), 1);

    const plan = asPlan(
      planFoundryActorUpdate(snapshot, target, {
        createId: sequentialIdFactory(),
        mode: "merge",
        callerIsGm: true,
      }),
    );
    const runtime = createInMemoryActorRuntime({ source: target, gm: true });
    const result = await applyFoundryActorUpdate({
      plan,
      snapshot,
      runtime,
      options: { createId: sequentialIdFactory() },
    });

    assert.equal(result.blocked, false, JSON.stringify(result.diagnostics, null, 2));
    assert.equal(countUnarmed(runtime.readActorSource()), 1);
  });

  it("exact-runtime create ships a single Unarmed Attack", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const world = createInMemoryWorld({ gm: true });
    const result = await createFoundryActor({
      snapshot,
      world,
      options: { createId: sequentialIdFactory() },
    });
    assert.equal(result.blocked, false);
    const actorId =
      result.output !== undefined &&
      typeof result.output === "object" &&
      result.output !== null &&
      "actorId" in result.output
        ? String(result.output.actorId)
        : "";
    const runtime = world.actors.get(actorId);
    assert.ok(runtime !== undefined);
    assert.equal(countUnarmed(runtime.readActorSource()), 1);
  });
});
