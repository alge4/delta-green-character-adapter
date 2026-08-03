import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { UpdatePlan } from "@delta-green-character-adapter/foundry-update-planner";

import { verifyAppliedActorState } from "../src/verify.js";
import { BLANK_ACTOR, readFoundryFixture, withActorName } from "./helpers.js";

const HASH = `sha256:${"a".repeat(64)}`;

function minimalPlan(path: string): UpdatePlan {
  return {
    planId: "00000000-0000-4000-8000-0000000000aa",
    mode: "merge",
    capabilityId: "foundry-deltagreen/14.365/1.7.0/export",
    agentId: "00000000-0000-4000-8000-0000000000bb",
    binding: { state: "unbound" },
    targetFingerprint: HASH,
    sourceContentHash: HASH,
    planDigest: HASH,
    blankTarget: true,
    alreadyUpToDate: false,
    scopes: {},
    permissions: {
      requiresActorUpdate: true,
      requiresGmForHandlerContent: false,
      requiresRecoverySnapshot: false,
    },
    entries: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        operation: "update",
        path,
        fieldClass: "profile",
        before: { kind: "scalar", typeName: "string", preview: "Alge" },
        proposed: { kind: "scalar", typeName: "string", preview: "Caleb" },
        selectedByDefault: true,
        selectionReason: "Profile and capability changes are selected by default.",
        dependencies: [],
      },
    ],
    auditPreview: {
      capabilityId: "foundry-deltagreen/14.365/1.7.0/export",
      adapterIds: ["adapter-foundry-deltagreen"],
      sourceContentHash: HASH,
      planDigest: HASH,
      targetFingerprint: HASH,
      mode: "merge",
    },
  };
}

describe("verifyAppliedActorState", () => {
  it("tolerates Foundry _stats modifiedTime/lastModifiedBy drift after apply", () => {
    const pre = withActorName(readFoundryFixture(BLANK_ACTOR), "Alge") as Record<string, unknown>;
    const post = structuredClone(pre) as Record<string, unknown>;
    post.name = "Caleb";
    const preStats = (pre._stats ?? {}) as Record<string, unknown>;
    post._stats = {
      ...preStats,
      modifiedTime: Number(preStats.modifiedTime ?? 0) + 1000,
      lastModifiedBy: "UserOther0000001",
    };

    const result = verifyAppliedActorState({
      preApplySource: pre,
      postApplySource: post,
      plan: minimalPlan("/name"),
      actions: [
        {
          entryId: "00000000-0000-4000-8000-000000000001",
          operation: "update",
          path: "/name",
          fieldClass: "profile",
          dependencies: [],
          value: "Caleb",
        },
      ],
    });
    assert.equal(result.ok, true);
  });

  it("matches added Items after Foundry trims trailing name whitespace", () => {
    const pre = withActorName(readFoundryFixture(BLANK_ACTOR), "Alge") as Record<string, unknown>;
    const post = structuredClone(pre) as Record<string, unknown>;
    const items = Array.isArray(post.items) ? [...post.items] : [];
    items.push({
      _id: "ItemMot00000001",
      name: "Beautiful algorthims.",
      type: "motivation",
      system: { description: "", disorder: "", crossedOut: false, disorderCured: false },
    });
    post.items = items;

    const result = verifyAppliedActorState({
      preApplySource: pre,
      postApplySource: post,
      plan: minimalPlan("/name"),
      actions: [
        {
          entryId: "00000000-0000-4000-8000-000000000002",
          operation: "add",
          path: "/items",
          fieldClass: "profile",
          dependencies: [],
          value: {
            name: "Beautiful algorthims. ",
            type: "motivation",
            system: { description: "", disorder: "", crossedOut: false, disorderCured: false },
          },
        },
      ],
    });
    assert.equal(result.ok, true);
  });

  it("still rejects unexpected _id changes", () => {
    const pre = withActorName(readFoundryFixture(BLANK_ACTOR), "Alge") as Record<string, unknown>;
    const post = structuredClone(pre) as Record<string, unknown>;
    post.name = "Caleb";
    post._id = "ActorTampered0001";

    const result = verifyAppliedActorState({
      preApplySource: pre,
      postApplySource: post,
      plan: minimalPlan("/name"),
      actions: [
        {
          entryId: "00000000-0000-4000-8000-000000000001",
          operation: "update",
          path: "/name",
          fieldClass: "profile",
          dependencies: [],
          value: "Caleb",
        },
      ],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /_id/);
    }
  });
});
