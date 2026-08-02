/**
 * CI / release gate for the installable Foundry module artifact (#29/#39).
 *
 * Proves MANIFEST, production files, exact-target metadata, corrected ApplicationV2
 * bootstrap surface, and the diagnose-sheet-mount call-site gate agree.
 *
 * Usage (from repo root after `pnpm build`):
 *   node apps/foundry-module/scripts/assert-packaged-artifact.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactRoot = resolve(moduleRoot, "artifact/delta-green-character-adapter");
const requiredFiles = ["README.md", "main.js", "module.json", "styles/styles.css"];
const expectedCapabilities = [
  "green-agent-creator-5c9e92d-to-canonical-1.0.0",
  "foundry-14.365-deltagreen-1.7.0-to-canonical-1.0.0",
  "canonical-1.0.0-to-foundry-14.365-deltagreen-1.7.0",
];
const expectedGreenCommit = "5c9e92d987f1251d62c172209fc53f8e8ac3372b";

function fail(message) {
  console.error(message);
  process.exit(1);
}

for (const relative of ["MANIFEST.json", ...requiredFiles.map((f) => `delta-green-character-adapter/${f}`)]) {
  if (!existsSync(resolve(moduleRoot, "artifact", relative))) {
    fail(`missing artifact file: ${relative}`);
  }
}

const moduleJson = JSON.parse(readFileSync(resolve(artifactRoot, "module.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(moduleRoot, "artifact/MANIFEST.json"), "utf8"));
const bundled = readFileSync(resolve(artifactRoot, "main.js"), "utf8");
const flags = moduleJson.flags?.deltaGreenCharacterAdapter;

if (moduleJson.id !== "delta-green-character-adapter") {
  fail(`unexpected module id: ${moduleJson.id}`);
}
if (moduleJson.compatibility?.verified !== "14.365") {
  fail("module.json Foundry compatibility.verified must be 14.365");
}
if (moduleJson.relationships?.systems?.[0]?.compatibility?.verified !== "1.7.0") {
  fail("module.json Delta Green compatibility.verified must be 1.7.0");
}
if (JSON.stringify(flags?.verifiedCapabilities) !== JSON.stringify(expectedCapabilities)) {
  fail("module.json verifiedCapabilities must match the three exact-target capability ids");
}
if (flags?.foundryCoreVersion !== "14.365") {
  fail("module.json foundryCoreVersion must be 14.365");
}
if (flags?.deltaGreenSystemVersion !== "1.7.0") {
  fail("module.json deltaGreenSystemVersion must be 1.7.0");
}
if (flags?.canonicalSchemaVersion !== "1.0.0") {
  fail("module.json canonicalSchemaVersion must be 1.0.0");
}
if (flags?.greenAgentCreatorCommit !== expectedGreenCommit) {
  fail(`module.json greenAgentCreatorCommit must be ${expectedGreenCommit}`);
}

if (JSON.stringify(manifest.flags) !== JSON.stringify(moduleJson.flags)) {
  fail("artifact/MANIFEST.json flags disagree with packaged module.json");
}
if (JSON.stringify(manifest.compatibility) !== JSON.stringify(moduleJson.compatibility)) {
  fail("artifact/MANIFEST.json compatibility disagrees with packaged module.json");
}
if (JSON.stringify([...manifest.files].sort()) !== JSON.stringify([...requiredFiles].sort())) {
  fail(`artifact/MANIFEST.json files unexpected: ${manifest.files.join(", ")}`);
}

for (const hook of [
  "renderActorSheet",
  "renderDocumentSheet",
  "renderActorSheetV2",
  "renderDocumentSheetV2",
]) {
  if (!bundled.includes(`"${hook}"`) && !bundled.includes(`'${hook}'`)) {
    fail(`packaged main.js missing Agent-sheet hook: ${hook}`);
  }
}

if (!/Hooks\.once\(["']ready["']/.test(bundled) || !bundled.includes("registerFoundryModule")) {
  fail("packaged main.js missing ready → registerFoundryModule bootstrap");
}

execFileSync("node", [resolve(moduleRoot, "scripts/diagnose-sheet-mount.mjs")], {
  cwd: moduleRoot,
  stdio: "inherit",
});

console.log("OK: packaged exact-target module artifact agrees (manifest, files, bootstrap, mount gate).");
