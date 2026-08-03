import { readFileSync } from "node:fs";
import { importGreenAgentCreator } from "../../../packages/adapter-green-agent-creator/dist/index.js";
import {
  planFoundryActorUpdate,
  parseUpdatePlan,
} from "../../../packages/foundry-update-planner/dist/index.js";
import { applyFoundryActorUpdate } from "../.test-dist/src/apply.js";
import { createInMemoryActorRuntime } from "../.test-dist/test/harness.js";
import { BLANK_ACTOR, readFoundryFixture, sequentialIdFactory } from "../.test-dist/test/helpers.js";

const path =
  process.argv[2] ||
  "C:/Users/alge4/Downloads/delta_green_character_Dr. Thomas Thorne.json";
const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
const imported = importGreenAgentCreator(text);
console.log(
  JSON.stringify(
    {
      stage: "import",
      blocked: imported.blocked,
      completeness: imported.completeness,
      fatals: (imported.diagnostics || [])
        .filter((d) => d.severity === "fatal" || d.severity === "error")
        .map((d) => ({ code: d.code, message: d.message })),
      resources: imported.output?.resources,
      name: imported.output?.identity?.name,
    },
    null,
    2,
  ),
);
if (imported.blocked || !imported.output) process.exit(1);

const blank = readFoundryFixture(BLANK_ACTOR);
blank.name = "Test";
const createId = sequentialIdFactory();
const runtime = createInMemoryActorRuntime({
  source: blank,
  gm: true,
  canUpdate: true,
});
const planResult = planFoundryActorUpdate(imported.output, runtime.readActorSource(), {
  mode: "merge",
  callerIsGm: true,
  createId,
  actorId: runtime.actorId,
  adapterVersion: "0.0.0",
});
console.log(
  JSON.stringify(
    {
      stage: "plan",
      blocked: planResult.blocked,
      fatals: (planResult.diagnostics || [])
        .filter((d) => d.severity === "fatal" || d.severity === "error")
        .map((d) => ({ code: d.code, message: d.message })),
      entries: planResult.plan?.entries?.length,
    },
    null,
    2,
  ),
);
if (!planResult.plan) process.exit(2);

const applyResult = await applyFoundryActorUpdate({
  runtime,
  snapshot: imported.output,
  plan: parseUpdatePlan(planResult.plan),
  options: {
    createId,
    adapterVersion: "0.0.0",
    now: "2026-08-03T00:00:00.000Z",
  },
});
const source = runtime.readActorSource();
console.log(
  JSON.stringify(
    {
      stage: "apply",
      blocked: applyResult.blocked,
      outputKind: applyResult.output?.kind,
      fatals: (applyResult.diagnostics || [])
        .filter((d) => d.severity === "fatal" || d.severity === "error")
        .map((d) => ({ code: d.code, message: d.message, technical: d.technical })),
      name: source.name,
      health: source.system?.health,
      wp: source.system?.wp,
      sanity: source.system?.sanity,
      itemCount: Array.isArray(source.items) ? source.items.length : 0,
    },
    null,
    2,
  ),
);
