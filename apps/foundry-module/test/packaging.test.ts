import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import { VERIFIED_INITIAL_CAPABILITY_IDS } from "@delta-green-character-adapter/adapter-core";

import { moduleRoot } from "./helpers.js";

type ModuleManifest = {
  id: string;
  version: string;
  esmodules: string[];
  styles: string[];
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
      canonicalSchemaVersion: string;
      greenAgentCreatorCommit: string;
    };
  };
};

type ArtifactManifest = {
  moduleId: string;
  version: string;
  compatibility: ModuleManifest["compatibility"];
  relationships: ModuleManifest["relationships"];
  flags: ModuleManifest["flags"];
  files: string[];
};

function readModuleManifest(): ModuleManifest {
  return JSON.parse(readFileSync(resolve(moduleRoot, "module.json"), "utf8")) as ModuleManifest;
}

function packageArtifact(): ArtifactManifest {
  execFileSync("node", [resolve(moduleRoot, "scripts/package-module.mjs")], {
    cwd: moduleRoot,
    stdio: "pipe",
  });
  return JSON.parse(
    readFileSync(resolve(moduleRoot, "artifact/MANIFEST.json"), "utf8"),
  ) as ArtifactManifest;
}

describe("Foundry module packaging (#29/#39)", () => {
  it("ships module.json with exact Foundry/DG metadata and the three verified capabilities", () => {
    const manifest = readModuleManifest();

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
    assert.equal(manifest.flags.deltaGreenCharacterAdapter.canonicalSchemaVersion, "1.0.0");
    assert.equal(
      manifest.flags.deltaGreenCharacterAdapter.greenAgentCreatorCommit,
      "5c9e92d987f1251d62c172209fc53f8e8ac3372b",
    );
    assert.equal(manifest.esmodules[0], "main.js");
    assert.equal(manifest.styles[0], "styles/styles.css");
  });

  it("builds a production artifact whose MANIFEST agrees with module.json and only production files", () => {
    const moduleManifest = readModuleManifest();
    const artifactManifest = packageArtifact();

    assert.deepEqual(artifactManifest.files.sort(), [
      "README.md",
      "main.js",
      "module.json",
      "styles/styles.css",
    ]);
    assert.equal(artifactManifest.moduleId, moduleManifest.id);
    assert.equal(artifactManifest.version, moduleManifest.version);
    assert.deepEqual(artifactManifest.compatibility, moduleManifest.compatibility);
    assert.deepEqual(artifactManifest.relationships, moduleManifest.relationships);
    assert.deepEqual(artifactManifest.flags, moduleManifest.flags);
    assert.deepEqual(
      artifactManifest.flags.deltaGreenCharacterAdapter.verifiedCapabilities,
      [...VERIFIED_INITIAL_CAPABILITY_IDS],
    );

    const packagedModuleJson = JSON.parse(
      readFileSync(
        resolve(moduleRoot, "artifact/delta-green-character-adapter/module.json"),
        "utf8",
      ),
    ) as ModuleManifest;
    assert.deepEqual(packagedModuleJson, moduleManifest);

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

  it("passes the packaged artifact agreement gate (bootstrap hooks + ApplicationV2 mount)", () => {
    packageArtifact();
    // Shared CI/release gate: MANIFEST, exact-target flags/capability ids, V2 bootstrap, diagnose mount.
    execFileSync("node", [resolve(moduleRoot, "scripts/assert-packaged-artifact.mjs")], {
      cwd: moduleRoot,
      stdio: "pipe",
    });
  });
});
