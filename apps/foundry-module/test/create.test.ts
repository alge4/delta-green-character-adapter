import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { foundrySemanticView } from "@delta-green-character-adapter/adapter-foundry-deltagreen";

import { createFoundryActor } from "../src/create.js";
import { isRecord } from "../src/paths.js";
import { createInMemoryWorld } from "./harness.js";
import { adapterFlags, readCanonicalFixture, sequentialIdFactory } from "./helpers.js";

describe("createFoundryActor", () => {
  it("creates an Actor from a canonical snapshot with compact audit flags", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const world = createInMemoryWorld({ gm: true });
    const result = await createFoundryActor({
      snapshot,
      world,
      options: {
        createId: sequentialIdFactory(),
        adapterVersion: "0.0.0",
        now: "2026-08-02T12:00:00.000Z",
      },
    });

    assert.equal(result.blocked, false);
    assert.ok(result.output !== undefined);
    assert.equal(isRecord(result.output) && result.output.kind, "created");

    const actorId = isRecord(result.output) ? String(result.output.actorId) : "";
    const runtime = world.actors.get(actorId);
    assert.ok(runtime !== undefined);

    const source = runtime.readActorSource();
    assert.ok(isRecord(source));
    assert.equal(source.type, "agent");
    assert.equal(source.name, "Export Subject");

    const flags = adapterFlags(source);
    assert.equal(flags.agentId, (snapshot as { agentId: string }).agentId);
    assert.ok(isRecord(flags.audit));
    assert.equal(flags.audit.capabilityId, "canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0");
    assert.equal(flags.audit.adapterVersion, "0.0.0");
    assert.equal(flags.audit.userId, "UserHarness0001");
    assert.equal(flags.audit.timestamp, "2026-08-02T12:00:00.000Z");
    assert.equal(flags.audit.sourceContentHash, (snapshot as { provenance: { contentHash: string } }).provenance.contentHash);

    const semantic = foundrySemanticView(source);
    assert.ok(isRecord(semantic));
    assert.equal(semantic.name, "Export Subject");

    // Recovery snapshots must never appear in flags.
    const serializedFlags = JSON.stringify(flags);
    assert.equal(serializedFlags.includes("recovery"), false);
  });
});
