/**
 * Local soak: GAC JSON samples → import → plan → in-memory apply.
 * Inputs: tmp/gac-community-samples/5c9e92d (ephemeral; not CI fixtures).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { importGreenAgentCreator } from "../../../packages/adapter-green-agent-creator/dist/index.js";
import {
  planFoundryActorUpdate,
  parseUpdatePlan,
} from "../../../packages/foundry-update-planner/dist/index.js";
import { applyFoundryActorUpdate } from "../.test-dist/src/apply.js";
import { cloneJson, isRecord } from "../.test-dist/src/paths.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const samplesRoot = resolve(repoRoot, "tmp/gac-community-samples/5c9e92d");
const blankPath = resolve(
  repoRoot,
  "fixtures/foundry/14.365-deltagreen-1.7.0/fvtt-Actor-blank-GZGftVGSKSRNSREr.json",
);

function walkJson(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkJson(abs));
    } else if (entry.isFile() && entry.name.endsWith(".json") && entry.name !== "MANIFEST.json") {
      out.push(abs);
    }
  }
  return out.sort();
}

function createRuntime(initialSource) {
  let source = cloneJson(initialSource);
  let i = 0;
  const createId = () => `soak${(++i).toString(16).padStart(12, "0")}`;
  return {
    createId,
    runtime: {
      actorId: typeof source._id === "string" ? source._id : "ActorSoak0000001",
      canUpdateActor: () => true,
      isGm: () => true,
      currentUserId: () => "UserSoak00000001",
      readActorSource: () => cloneJson(source),
      captureRecoverySnapshot: () => cloneJson(source),
      verifyRecoverySnapshot: (snapshot) => {
        try {
          return JSON.stringify(snapshot) === JSON.stringify(JSON.parse(JSON.stringify(snapshot)));
        } catch {
          return false;
        }
      },
      async restoreFromSnapshot(snapshot) {
        source = cloneJson(snapshot);
      },
      async updateActor(diff) {
        const next = cloneJson(source);
        for (const [key, value] of Object.entries(diff)) {
          const parts = key.split(".");
          let cur = next;
          for (let p = 0; p < parts.length - 1; p++) {
            const seg = parts[p];
            if (!isRecord(cur[seg])) cur[seg] = {};
            cur = cur[seg];
          }
          cur[parts[parts.length - 1]] = value;
        }
        if (isRecord(next._stats)) {
          next._stats = {
            ...next._stats,
            modifiedTime: Date.now(),
            lastModifiedBy: "UserSoak00000001",
          };
        }
        source = next;
      },
      async createEmbeddedItems(data) {
        const ids = [];
        const next = cloneJson(source);
        if (!Array.isArray(next.items)) next.items = [];
        for (const item of data) {
          const copy = cloneJson(item);
          if (isRecord(copy) && typeof copy.name === "string") {
            copy.name = copy.name.trim();
          }
          const id =
            isRecord(copy) && typeof copy._id === "string" && copy._id !== ""
              ? copy._id
              : createId();
          if (isRecord(copy)) copy._id = id;
          next.items.push(copy);
          ids.push(id);
        }
        source = next;
        return ids;
      },
      async deleteEmbeddedItems(ids) {
        const remove = new Set(ids);
        const next = cloneJson(source);
        next.items = (Array.isArray(next.items) ? next.items : []).filter(
          (item) => !(isRecord(item) && remove.has(item._id)),
        );
        source = next;
      },
      async updateEmbeddedItem(id, diff) {
        const next = cloneJson(source);
        next.items = (Array.isArray(next.items) ? next.items : []).map((item) => {
          if (!isRecord(item) || item._id !== id) return item;
          const copy = { ...item };
          for (const [key, value] of Object.entries(diff)) {
            if (key === "_id") continue;
            const parts = key.split(".");
            let cur = copy;
            for (let p = 0; p < parts.length - 1; p++) {
              const seg = parts[p];
              if (!isRecord(cur[seg])) cur[seg] = {};
              cur = cur[seg];
            }
            cur[parts[parts.length - 1]] = value;
          }
          return copy;
        });
        source = next;
      },
    },
    getSource: () => source,
  };
}

function summarizeDiags(diagnostics = []) {
  const fatals = diagnostics.filter((d) => d.severity === "fatal" || d.severity === "error");
  return fatals.slice(0, 8).map((d) => `${d.code}: ${d.message}`);
}

if (!existsSync(samplesRoot)) {
  console.error(`Missing samples at ${samplesRoot}`);
  process.exit(1);
}

const blank = JSON.parse(readFileSync(blankPath, "utf8"));
const files = walkJson(samplesRoot);
const rows = [];

for (const file of files) {
  const rel = relative(samplesRoot, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const sha = createHash("sha256").update(text).digest("hex");
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    rows.push({
      file: rel,
      sha256: sha,
      stage: "parse",
      ok: false,
      errors: [String(error)],
    });
    continue;
  }

  const imported = importGreenAgentCreator(text);
  if (imported.blocked || !imported.output) {
    rows.push({
      file: rel,
      sha256: sha,
      professionKey: raw.professionKey ?? null,
      name: raw.personalInfo?.name ?? null,
      stage: "import",
      ok: false,
      completeness: imported.completeness,
      errors: summarizeDiags(imported.diagnostics),
    });
    continue;
  }

  const actor = cloneJson(blank);
  actor.name = "SoakTarget";
  actor._id = "ActorSoak0000001";
  const { runtime, createId, getSource } = createRuntime(actor);

  const planResult = planFoundryActorUpdate(imported.output, runtime.readActorSource(), {
    mode: "merge",
    callerIsGm: true,
    createId,
    actorId: runtime.actorId,
    adapterVersion: "0.0.0",
  });

  if (!planResult.plan || planResult.blocked) {
    rows.push({
      file: rel,
      sha256: sha,
      professionKey: raw.professionKey ?? null,
      name: raw.personalInfo?.name ?? imported.output?.identity?.name ?? null,
      stage: "plan",
      ok: false,
      errors: summarizeDiags(planResult.diagnostics),
    });
    continue;
  }

  const plan = parseUpdatePlan(planResult.plan);
  const applyResult = await applyFoundryActorUpdate({
    runtime,
    snapshot: imported.output,
    plan,
    options: {
      createId,
      adapterVersion: "0.0.0",
      now: "2026-08-03T00:00:00.000Z",
    },
  });

  const source = getSource();
  const ok = applyResult.blocked !== true && applyResult.output?.kind === "applied";
  rows.push({
    file: rel,
    sha256: sha,
    professionKey: raw.professionKey ?? null,
    name: raw.personalInfo?.name ?? imported.output?.identity?.name ?? null,
    stage: ok ? "apply" : "apply-failed",
    ok,
    outputKind: applyResult.output?.kind ?? null,
    resultName: isRecord(source) ? source.name : null,
    itemCount: Array.isArray(source.items) ? source.items.length : 0,
    errors: ok ? [] : summarizeDiags(applyResult.diagnostics),
  });
}

const passed = rows.filter((r) => r.ok).length;
const failed = rows.filter((r) => !r.ok);
const report = {
  generatedAt: new Date().toISOString(),
  samplesRoot,
  total: rows.length,
  passed,
  failed: failed.length,
  byProfession: Object.fromEntries(
    [...new Set(rows.map((r) => r.professionKey ?? "unknown"))].map((k) => [
      k,
      {
        total: rows.filter((r) => (r.professionKey ?? "unknown") === k).length,
        passed: rows.filter((r) => (r.professionKey ?? "unknown") === k && r.ok).length,
        failed: rows.filter((r) => (r.professionKey ?? "unknown") === k && !r.ok).length,
      },
    ]),
  ),
  failures: failed,
  rows,
};

const reportDir = resolve(repoRoot, "tmp/gac-community-samples");
mkdirSync(reportDir, { recursive: true });
const reportPath = resolve(reportDir, "soak-report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      byProfession: report.byProfession,
      failures: report.failures.map((f) => ({
        file: f.file,
        stage: f.stage,
        professionKey: f.professionKey,
        name: f.name,
        errors: f.errors,
      })),
      reportPath,
    },
    null,
    2,
  ),
);

process.exit(failed.length > 0 ? 2 : 0);
