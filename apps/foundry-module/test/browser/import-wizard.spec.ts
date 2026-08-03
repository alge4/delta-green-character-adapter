import assert from "node:assert/strict";

import { expect, test } from "@playwright/test";

import { getByPointer } from "../../src/paths.js";
import { adapterFlags, bindActor } from "../helpers.js";
import {
  bindSessionToPage,
  calebFixturePath,
  createBrowserWizard,
  waitForMount,
} from "./helpers.js";

test("browser: import Caleb into a blank Agent Actor through verified persistence", async ({
  page,
}) => {
  const { runtime, session } = createBrowserWizard();
  await bindSessionToPage(page, session);
  await page.goto("/");
  await waitForMount(page);

  await expect(page.getByRole("img", { name: /Completeness Assessment/i })).toBeVisible();
  // Aria snapshots are OS-stable reviewed baselines (pixel screenshots differ Windows↔Linux).
  await expect(page.locator("[data-dgca-titlebar]")).toMatchAriaSnapshot({
    name: "titlebar-lamp",
  });

  await page.getByRole("button", { name: "Import…" }).click();
  const dialog = page.getByRole("dialog", { name: "Import Agent" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toMatchAriaSnapshot({ name: "import-source" });

  await page.getByTestId("dgca-source-file").setInputFiles(calebFixturePath);
  await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
  await expect(dialog).toMatchAriaSnapshot({ name: "import-diagnostics" });

  // Acknowledge every pending group (buttons appear once per diagnostic sharing the key;
  // clicking any one for a key clears that pending group).
  while ((await page.locator("[data-testid^='dgca-ack-']").count()) > 0) {
    await page.locator("[data-testid^='dgca-ack-']").first().click();
  }

  await page.getByTestId("dgca-continue-plan").click();
  await expect(page.getByRole("heading", { name: "Update Plan" })).toBeVisible();
  await expect(dialog).toMatchAriaSnapshot({ name: "import-plan" });

  await expect(page.getByTestId("dgca-apply")).toBeEnabled();
  await page.getByTestId("dgca-apply").click();

  await expect(page.getByRole("heading", { name: "Applied" })).toBeVisible();
  await expect(dialog).toMatchAriaSnapshot({ name: "import-applied" });
  await page.getByTestId("dgca-done-close").click();

  const source = runtime.readActorSource();
  const flags = adapterFlags(source);
  assert.equal(typeof flags.agentId, "string");
  assert.equal(getByPointer(source, "/system/biography/profession"), "Computer Scientist or Engineer");
  assert.equal(getByPointer(source, "/system/statistics/str/value"), 8);
});

test("browser: populated Agent merge preserves mutable campaign state by default", async ({
  page,
}) => {
  const bootstrap = createBrowserWizard({ now: "2026-08-02T12:00:00.000Z" });
  // Drive the same flow headlessly to seed a bound populated Agent Actor.
  bootstrap.session.open();
  bootstrap.session.loadLocalGreenSource({
    bytes: new Uint8Array(await (await import("node:fs/promises")).readFile(calebFixturePath)),
    fileName: "caleb.json",
  });
  for (const groupKey of bootstrap.session.view().pendingGroupAcknowledgements) {
    bootstrap.session.acknowledgeGroup(groupKey);
  }
  bootstrap.session.continueToPlan();
  assert.equal(bootstrap.session.view().canApply, true);
  await bootstrap.session.confirmApply();
  assert.equal(bootstrap.session.view().phase, "done");

  const imported = structuredClone(bootstrap.runtime.readActorSource()) as Record<string, unknown>;
  const system = imported.system as Record<string, unknown>;
  system.health = { ...(system.health as object), value: 6 };
  system.wp = { ...(system.wp as object), value: 9 };
  system.sanity = {
    ...(system.sanity as object),
    value: 40,
    currentBreakingPoint: 40,
  };
  (system.biography as Record<string, unknown>).profession = "Interim Role";
  const agentId = adapterFlags(imported).agentId as string;

  const { runtime, session } = createBrowserWizard({
    source: bindActor(imported, agentId),
    now: "2026-08-02T13:00:00.000Z",
  });
  await bindSessionToPage(page, session);
  await page.goto("/");
  await waitForMount(page);

  await page.getByRole("button", { name: "Import…" }).click();
  await page.getByTestId("dgca-source-file").setInputFiles(calebFixturePath);
  await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible();
  while ((await page.locator("[data-testid^='dgca-ack-']").count()) > 0) {
    await page.locator("[data-testid^='dgca-ack-']").first().click();
  }
  await expect(page.getByTestId("dgca-continue-plan")).toBeEnabled();
  await page.getByTestId("dgca-continue-plan").click();
  await expect(page.getByRole("heading", { name: "Update Plan" })).toBeVisible();

  // Already bound — no bind confirmation required; apply selected profile defaults.
  await expect(page.getByTestId("dgca-apply")).toBeEnabled();
  await page.getByTestId("dgca-apply").click();
  await expect(page.getByRole("heading", { name: "Applied" })).toBeVisible();

  const source = runtime.readActorSource();
  assert.equal(getByPointer(source, "/system/health/value"), 6);
  assert.equal(getByPointer(source, "/system/wp/value"), 9);
  assert.equal(getByPointer(source, "/system/sanity/value"), 40);
  assert.equal(
    getByPointer(source, "/system/biography/profession"),
    "Computer Scientist or Engineer",
  );
});
