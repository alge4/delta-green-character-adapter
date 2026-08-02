import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { VERIFIED_INITIAL_CAPABILITY_IDS } from "@delta-green-character-adapter/adapter-core";

import { moduleRoot } from "./helpers.js";

describe("Foundry module packaging (#29)", () => {
  it("ships module.json with exact Foundry/DG metadata and the three verified capabilities", () => {
    const manifest = JSON.parse(readFileSync(resolve(moduleRoot, "module.json"), "utf8")) as {
      id: string;
      compatibility: { minimum: string; verified: string; maximum: string };
      relationships: {
        systems: Array<{
          id: string;
          compatibility: { minimum: string; verified: string; maximum: string };
        }>;
      };
      flags: {
        deltaGreenCharacterAdapter: {
          verifiedCapabilities: string[];
          foundryCoreVersion: string;
          deltaGreenSystemVersion: string;
        };
      };
    };

    assert.equal(manifest.id, "delta-green-character-adapter");
    assert.deepEqual(manifest.compatibility, {
      minimum: "14.365",
      verified: "14.365",
      maximum: "14.365",
    });
    assert.equal(manifest.relationships.systems[0]?.id, "deltagreen");
    assert.deepEqual(manifest.relationships.systems[0]?.compatibility, {
      minimum: "1.7.0",
      verified: "1.7.0",
      maximum: "1.7.0",
    });
    assert.deepEqual(
      manifest.flags.deltaGreenCharacterAdapter.verifiedCapabilities,
      [...VERIFIED_INITIAL_CAPABILITY_IDS],
    );
    assert.equal(manifest.flags.deltaGreenCharacterAdapter.foundryCoreVersion, "14.365");
    assert.equal(manifest.flags.deltaGreenCharacterAdapter.deltaGreenSystemVersion, "1.7.0");
  });

  it("builds a production artifact with only module.json, main.js, styles, and README", () => {
    execFileSync("node", [resolve(moduleRoot, "scripts/package-module.mjs")], {
      cwd: moduleRoot,
      stdio: "pipe",
    });

    const artifactManifest = JSON.parse(
      readFileSync(resolve(moduleRoot, "artifact/MANIFEST.json"), "utf8"),
    ) as { files: string[] };

    assert.deepEqual(artifactManifest.files.sort(), [
      "README.md",
      "main.js",
      "module.json",
      "styles/styles.css",
    ]);
    assert.equal(
      existsSync(resolve(moduleRoot, "artifact/delta-green-character-adapter/main.js")),
      true,
    );
    const bundled = readFileSync(
      resolve(moduleRoot, "artifact/delta-green-character-adapter/main.js"),
      "utf8",
    );
    assert.match(bundled, /registerFoundryModule|delta-green-character-adapter/i);
    assert.equal(bundled.includes(".tsbuildinfo"), false);
    assert.equal(bundled.includes("sourceMappingURL"), false);
  });
});
