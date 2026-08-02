import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import type { ImportWizardSession } from "../../src/wizard/session.js";
import { createImportWizardSession } from "../../src/wizard/session.js";
import { createInMemoryActorRuntime, type InMemoryActorRuntime } from "../harness.js";
import { BLANK_ACTOR, readFoundryFixture, sequentialIdFactory, withActorName } from "../helpers.js";

const here = dirname(fileURLToPath(import.meta.url));
export const calebFixturePath = resolve(
  here,
  "../../../../fixtures/green-agent-creator/5c9e92d/caleb.json",
);

export const supportedSheet = {
  documentName: "Actor",
  actorType: "agent",
  systemId: "deltagreen",
  systemVersion: "1.7.0",
  coreVersion: "14.365",
} as const;

export function createBrowserWizard(options?: {
  readonly source?: unknown;
  readonly gm?: boolean;
  readonly now?: string;
}): {
  runtime: InMemoryActorRuntime;
  session: ImportWizardSession;
} {
  const runtime = createInMemoryActorRuntime({
    source: options?.source ?? withActorName(readFoundryFixture(BLANK_ACTOR), "Caleb"),
    gm: options?.gm !== false,
    canUpdate: true,
  });
  const session = createImportWizardSession({
    runtime,
    sheet: supportedSheet,
    options: {
      createId: sequentialIdFactory(),
      adapterVersion: "0.0.0",
      now: options?.now ?? "2026-08-02T12:00:00.000Z",
      sheetCompleteness: "amber",
    },
  });
  return { runtime, session };
}

export async function bindSessionToPage(page: Page, session: ImportWizardSession): Promise<void> {
  await page.exposeBinding("dgcaInvoke", async (_source, method: string, ...args: unknown[]) => {
    const target = session as unknown as Record<string, (...fnArgs: unknown[]) => unknown>;
    const fn = target[method];
    if (typeof fn !== "function") {
      throw new Error(`Unknown wizard method: ${method}`);
    }
    return await fn.apply(session, args);
  });
}

export async function waitForMount(page: Page): Promise<void> {
  page.on("pageerror", (error) => {
    console.error("pageerror", error);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error("console", message.text());
    }
  });
  await page.waitForFunction(() => window.__DGCA_MOUNTED__ === true, null, {
    timeout: 30_000,
  });
}

export function readCalebBytes(): Buffer {
  return readFileSync(calebFixturePath);
}
