import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BLANK_UNTOUCHED_FINGERPRINT,
  isBlankUntouchedTarget,
  untouchedDefaultFingerprint,
} from "../src/blank-fingerprint.js";
import { BLANK_ACTOR, readFoundryFixture } from "./helpers.js";

describe("Blank untouched fingerprint", () => {
  it("matches the baked fingerprint for the pinned blank Actor fixture", () => {
    const blank = readFoundryFixture(BLANK_ACTOR);
    assert.equal(untouchedDefaultFingerprint(blank), BLANK_UNTOUCHED_FINGERPRINT);
    assert.equal(isBlankUntouchedTarget(blank), true);
  });

  it("treats live POW×5 sanity and empty items as the same blank class", () => {
    const blank = structuredClone(readFoundryFixture(BLANK_ACTOR)) as {
      items: unknown[];
      system: { sanity: { value: number; currentBreakingPoint: number } };
    };
    blank.system.sanity.value = 50;
    blank.system.sanity.currentBreakingPoint = 40;
    blank.items = [];
    assert.equal(untouchedDefaultFingerprint(blank), BLANK_UNTOUCHED_FINGERPRINT);
    assert.equal(isBlankUntouchedTarget(blank), true);
  });

  it("treats live POW×5 sanity with only system Unarmed as blank", () => {
    const blank = structuredClone(readFoundryFixture(BLANK_ACTOR)) as {
      system: { sanity: { value: number; currentBreakingPoint: number } };
    };
    blank.system.sanity.value = 50;
    blank.system.sanity.currentBreakingPoint = 40;
    assert.equal(untouchedDefaultFingerprint(blank), BLANK_UNTOUCHED_FINGERPRINT);
    assert.equal(isBlankUntouchedTarget(blank), true);
  });

  it("rejects a customized sanity value as blank", () => {
    const blank = structuredClone(readFoundryFixture(BLANK_ACTOR)) as {
      system: { sanity: { value: number; currentBreakingPoint: number } };
    };
    blank.system.sanity.value = 70;
    blank.system.sanity.currentBreakingPoint = 56;
    assert.equal(isBlankUntouchedTarget(blank), false);
  });
});
