import { mountImportWizardUi, type WizardHost } from "../src/ui/mount.js";
import "../src/ui/styles.css";
import "./harness.css";

type Invoke = (method: string, ...args: unknown[]) => Promise<unknown>;

declare global {
  interface Window {
    dgcaInvoke?: Invoke;
    __DGCA_MOUNTED__?: boolean;
  }
}

async function waitForInvoke(timeoutMs = 15_000): Promise<Invoke> {
  const start = Date.now();
  while (window.dgcaInvoke === undefined) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for Playwright dgcaInvoke bindings.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return window.dgcaInvoke;
}

async function boot(): Promise<void> {
  const invoke = await waitForInvoke();
  const host: WizardHost = {
    view: () => invoke("view") as Promise<import("../src/wizard/session.js").ImportWizardView>,
    open: () => invoke("open").then(() => undefined),
    close: () => invoke("close").then(() => undefined),
    cancel: () => invoke("cancel").then(() => undefined),
    loadLocalGreenSource: (input) =>
      invoke("loadLocalGreenSource", input).then(() => undefined),
    selectRemediation: (fingerprint, action, parameters) =>
      invoke("selectRemediation", fingerprint, action, parameters).then(() => undefined),
    acknowledgeGroup: (groupKey) => invoke("acknowledgeGroup", groupKey).then(() => undefined),
    continueToPlan: () => invoke("continueToPlan").then(() => undefined),
    backToDiagnostics: () => invoke("backToDiagnostics").then(() => undefined),
    setEntrySelected: (entryId, selected) =>
      invoke("setEntrySelected", entryId, selected).then(() => undefined),
    acceptReplan: () => invoke("acceptReplan").then(() => undefined),
    confirmApply: () => invoke("confirmApply").then(() => undefined),
    dismissRecovery: () => invoke("dismissRecovery").then(() => undefined),
  };

  const titleBar = document.querySelector("[data-dgca-titlebar]");
  const modalHost = document.querySelector("[data-dgca-modal-host]");
  const bioHost = document.querySelector("[data-dgca-bio-host]");
  if (!(titleBar instanceof HTMLElement) || !(modalHost instanceof HTMLElement)) {
    throw new Error("Harness chrome slots are missing.");
  }

  mountImportWizardUi({
    host,
    titleBar,
    modalHost,
    ...(bioHost instanceof HTMLElement ? { bioHost } : {}),
  });
  window.__DGCA_MOUNTED__ = true;
}

void boot();
