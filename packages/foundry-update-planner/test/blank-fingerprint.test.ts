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
});
