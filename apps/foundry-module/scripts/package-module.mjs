import { build } from "esbuild";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(root, "../..");
const artifactRoot = resolve(root, "artifact/delta-green-character-adapter");
const moduleJsonPath = resolve(root, "module.json");

function listFiles(dir, prefix = "") {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const absolute = join(dir, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    if (statSync(absolute).isDirectory()) {
      entries.push(...listFiles(absolute, relative));
    } else {
      entries.push(relative.replace(/\\/g, "/"));
    }
  }
  return entries;
}

rmSync(resolve(root, "artifact"), { recursive: true, force: true });
mkdirSync(resolve(artifactRoot, "styles"), { recursive: true });

const moduleJson = JSON.parse(readFileSync(moduleJsonPath, "utf8"));
writeFileSync(resolve(artifactRoot, "module.json"), `${JSON.stringify(moduleJson, null, 2)}\n`);

const cryptoShim = resolve(root, "scripts/crypto-shim.mjs");

await build({
  absWorkingDir: repoRoot,
  entryPoints: [resolve(root, "dist/foundry/bootstrap.js")],
  outfile: resolve(artifactRoot, "main.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  logLevel: "silent",
  plugins: [
    {
      name: "node-crypto-shim",
      setup(buildApi) {
        buildApi.onResolve({ filter: /^node:crypto$/ }, () => ({
          path: cryptoShim,
        }));
      },
    },
  ],
});

copyFileSync(resolve(root, "dist/ui/styles.css"), resolve(artifactRoot, "styles/styles.css"));
copyFileSync(resolve(root, "README.md"), resolve(artifactRoot, "README.md"));

const files = listFiles(artifactRoot).sort();
const forbidden = files.filter(
  (file) =>
    file.endsWith(".ts") ||
    file.endsWith(".map") ||
    file.endsWith(".tsbuildinfo") ||
    file.includes("test") ||
    file.includes(".test-dist"),
);

if (forbidden.length > 0) {
  throw new Error(`Production artifact contains non-production files: ${forbidden.join(", ")}`);
}

const required = ["module.json", "main.js", "styles/styles.css", "README.md"];
for (const file of required) {
  if (!files.includes(file)) {
    throw new Error(`Production artifact missing required file: ${file}`);
  }
}

if (files.length !== required.length) {
  throw new Error(`Production artifact has unexpected files: ${files.join(", ")}`);
}

writeFileSync(
  resolve(root, "artifact/MANIFEST.json"),
  `${JSON.stringify(
    {
      moduleId: moduleJson.id,
      version: moduleJson.version,
      compatibility: moduleJson.compatibility,
      relationships: moduleJson.relationships,
      flags: moduleJson.flags,
      files,
    },
    null,
    2,
  )}\n`,
);

console.log(`Packaged Foundry module artifact with ${files.length} production files.`);
