import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import {
  planFoundryActorUpdate,
  targetActorFingerprint,
} from "@delta-green-character-adapter/foundry-update-planner";

import { applyFoundryActorUpdate } from "../src/apply.js";
import { MANUAL_RECOVERY_DISCLOSURE } from "../src/diagnostics.js";
import { deepEqual, isRecord } from "../src/paths.js";
import { createInMemoryActorRuntime } from "./harness.js";
import {
  BLANK_ACTOR,
  adapterFlags,
  asPlan,
  bindActor,
  readCanonicalFixture,
  readFoundryFixture,
  sequentialIdFactory,
  withActorName,
} from "./helpers.js";

describe("applyFoundryActorUpdate rollback", () => {
  it("rolls back to the pre-apply Actor when mutation fails", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const agentId = (snapshot as { agentId: string }).agentId;
    const target = bindActor(
      withActorName(readFoundryFixture(BLANK_ACTOR), "Export Subject"),
      agentId,
    );
    const plan = asPlan(
      planFoundryActorUpdate(snapshot, target, {
        createId: sequentialIdFactory(),
        mode: "merge",
        callerIsGm: true,
      }),
    );

    const runtime = createInMemoryActorRuntime({
      source: target,
      gm: true,
      injectFailure: { stage: "duringUpdate" },
    });
    const before = runtime.readActorSource();
    const beforeFingerprint = targetActorFingerprint(before);

    const result = await applyFoundryActorUpdate({
      plan,
      snapshot,
      runtime,
      options: { createId: sequentialIdFactory() },
    });

    assert.equal(result.blocked, true);
    assert.ok(result.diagnostics.some((entry) => entry.code === "adapter.apply.failure"));
    assert.ok(deepEqual(runtime.readActorSource(), before));
    assert.equal(targetActorFingerprint(runtime.readActorSource()), beforeFingerprint);
    assert.equal(adapterFlags(runtime.readActorSource()).audit, undefined);
  });

  it("offers manual recovery when rollback is incomplete and never stores the snapshot in flags", async () => {
    const snapshot = readCanonicalFixture("f1-minimal-create-new.json");
    const agentId = (snapshot as { agentId: string }).agentId;
    const target = bindActor(
      withActorName(readFoundryFixture(BLANK_ACTOR), "Export Subject"),
      agentId,
    );
    const plan = asPlan(
      planFoundryActorUpdate(snapshot, target, {
        createId: sequentialIdFactory(),
        mode: "merge",
        callerIsGm: true,
      }),
    );

    const runtime = createInMemoryActorRuntime({
      source: target,
      gm: true,
      injectFailure: [{ stage: "duringUpdate" }, { stage: "duringRestore" }],
    });

    let manualSnapshot: unknown;
    let disclosure = "";
    const result = await applyFoundryActorUpdate({
      plan,
      snapshot,
      runtime,
      options: {
        createId: sequentialIdFactory(),
        onManualRecovery: (snapshotValue, text) => {
          manualSnapshot = snapshotValue;
          disclosure = text;
        },
      },
    });

    assert.equal(result.blocked, true);
    assert.ok(result.diagnostics.some((entry) => entry.code === "adapter.apply.failure"));
    assert.ok(manualSnapshot !== undefined);
    assert.equal(disclosure, MANUAL_RECOVERY_DISCLOSURE);
    assert.ok(isRecord(result.output) && result.output.kind === "manual-recovery");
    assert.ok(isRecord(result.output) && result.output.recoverySnapshot !== undefined);

    const flags = adapterFlags(runtime.readActorSource());
    assert.equal(flags.audit, undefined);
    const source = runtime.readActorSource();
    const namespaceFlags =
      isRecord(source) && isRecord(source.flags) ? source.flags[ADAPTER_FLAG_NAMESPACE] : undefined;
    const flagJson = JSON.stringify(namespaceFlags ?? {});
    assert.equal(flagJson.includes("recovery"), false);
    assert.ok(!JSON.stringify(flags).includes('"system"'));
  });
});
