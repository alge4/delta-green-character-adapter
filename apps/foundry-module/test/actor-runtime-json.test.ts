import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFoundryActorRuntime } from "../src/foundry/actor-runtime.js";
import { isRecord } from "../src/paths.js";
import { BLANK_ACTOR, readFoundryFixture, withActorName } from "./helpers.js";

class FakeColor {
  constructor(private readonly hex: string) {}
  toJSON(): string {
    return this.hex;
  }
}

describe("createFoundryActorRuntime plain JSON boundary", () => {
  it("strips Foundry Color-like class instances from Actor source and recovery snapshots", () => {
    const base = withActorName(readFoundryFixture(BLANK_ACTOR), "Alge") as Record<string, unknown>;
    const live = structuredClone(base) as Record<string, unknown>;
    live.prototypeToken = {
      ...(isRecord(live.prototypeToken) ? live.prototypeToken : {}),
      texture: {
        ...(isRecord(live.prototypeToken) && isRecord(live.prototypeToken.texture)
          ? live.prototypeToken.texture
          : {}),
        tint: new FakeColor("#ff0000"),
      },
    };

    const runtime = createFoundryActorRuntime({
      actor: {
        id: "ActorBlank000001",
        type: "agent",
        isOwner: true,
        toObject: () => live,
        update: async () => undefined,
        createEmbeddedDocuments: async () => [],
        deleteEmbeddedDocuments: async () => undefined,
        updateEmbeddedDocuments: async () => undefined,
      },
      user: { id: "UserHarness0001", isGM: true },
    });

    const source = runtime.readActorSource();
    assert.ok(isRecord(source));
    assert.ok(isRecord(source.prototypeToken));
    assert.ok(isRecord(source.prototypeToken.texture));
    assert.equal(source.prototypeToken.texture.tint, "#ff0000");
    assert.equal(Object.getPrototypeOf(source.prototypeToken.texture.tint), String.prototype);

    const snapshot = runtime.captureRecoverySnapshot();
    assert.ok(runtime.verifyRecoverySnapshot(snapshot));
    assert.ok(isRecord(snapshot));
    assert.ok(isRecord(snapshot.prototypeToken));
    assert.ok(isRecord(snapshot.prototypeToken.texture));
    assert.equal(snapshot.prototypeToken.texture.tint, "#ff0000");
  });

  it("passes mutable plain JSON into createEmbeddedDocuments (Zod-frozen system breaks Foundry HTMLField)", async () => {
    // Zod-parsed add payloads freeze nested system objects; Foundry HTMLField then throws
    // "Cannot assign to read only property 'description'" during Item create (#40).
    const frozenSystem = Object.freeze({
      description: "",
      score: 13,
      relationship: "",
      hasBeenDamagedSinceLastHomeScene: false,
    });
    const addition = {
      name: "My Best Friend, Bruce",
      type: "bond",
      system: frozenSystem,
      flags: { deltaGreenCharacterAdapter: { canonicalId: "bond-1" } },
    };

    let received: unknown;
    const runtime = createFoundryActorRuntime({
      actor: {
        id: "ActorBlank000001",
        type: "agent",
        isOwner: true,
        toObject: () => readFoundryFixture(BLANK_ACTOR),
        update: async () => undefined,
        createEmbeddedDocuments: async (_name, data) => {
          received = data[0];
          const item = data[0] as { system?: { description?: string } };
          // Mimic Foundry DataModel assignment onto the provided source object.
          item.system!.description = item.system!.description ?? "";
          return [{ id: "ItemBond0000001" }];
        },
        deleteEmbeddedDocuments: async () => undefined,
        updateEmbeddedDocuments: async () => undefined,
      },
      user: { id: "UserHarness0001", isGM: true },
    });

    const ids = await runtime.createEmbeddedItems([addition]);
    assert.deepEqual(ids, ["ItemBond0000001"]);
    assert.ok(isRecord(received));
    assert.ok(isRecord(received.system));
    assert.equal(Object.isFrozen(received.system), false);
    assert.equal(
      Object.getOwnPropertyDescriptor(received.system, "description")?.writable,
      true,
    );
  });
});
