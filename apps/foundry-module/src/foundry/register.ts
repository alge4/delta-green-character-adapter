import { importFoundryDeltaGreen } from "@delta-green-character-adapter/adapter-foundry-deltagreen";
import type { AgentSnapshot } from "@delta-green-character-adapter/character-model";
import { assessAgentSnapshot } from "@delta-green-character-adapter/validation";

import { mountImportWizardUi } from "../ui/mount.js";
import { createImportWizardSession } from "../wizard/session.js";
import { isSupportedAgentSheet } from "../wizard/sheet-eligibility.js";
import {
  createFoundryActorRuntime,
  type FoundryActorDocument,
  type FoundryUserLike,
} from "./actor-runtime.js";

export type FoundryHooksLike = {
  on(event: string, fn: (...args: never[]) => unknown): void;
};

export type FoundryGameLike = {
  readonly system?: { readonly id?: string; readonly version?: string };
  readonly version?: string;
  readonly user?: FoundryUserLike;
};

export type FoundrySheetLike = {
  readonly actor?: FoundryActorDocument & { readonly type: string };
  readonly element?: unknown;
};

export type RegisterFoundryModuleInput = {
  readonly hooks: FoundryHooksLike;
  readonly getGame: () => FoundryGameLike;
  readonly adapterVersion?: string;
};

function asHtmlElement(value: unknown): HTMLElement | null {
  if (value instanceof HTMLElement) {
    return value;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    "jquery" in value &&
    Array.isArray(value) &&
    value[0] instanceof HTMLElement
  ) {
    return value[0];
  }
  return null;
}

function ensureChromeSlots(root: HTMLElement): {
  titleBar: HTMLElement;
  modalHost: HTMLElement;
  bioHost: HTMLElement | undefined;
} {
  const windowEl =
    root.closest(".app, .application, .window-app") instanceof HTMLElement
      ? (root.closest(".app, .application, .window-app") as HTMLElement)
      : root;

  let titleBar = windowEl.querySelector("[data-dgca-titlebar]");
  if (!(titleBar instanceof HTMLElement)) {
    const header =
      windowEl.querySelector(".window-header, .application-header, header") instanceof HTMLElement
        ? (windowEl.querySelector(".window-header, .application-header, header") as HTMLElement)
        : windowEl;
    titleBar = document.createElement("div");
    titleBar.setAttribute("data-dgca-titlebar", "true");
    titleBar.className = "dgca-titlebar-actions";
    header.append(titleBar);
  }

  let modalHost = windowEl.querySelector("[data-dgca-modal-host]");
  if (!(modalHost instanceof HTMLElement)) {
    modalHost = document.createElement("div");
    modalHost.setAttribute("data-dgca-modal-host", "true");
    modalHost.className = "dgca-modal-host";
    if (getComputedStyle(windowEl).position === "static") {
      windowEl.style.position = "relative";
    }
    windowEl.append(modalHost);
  }

  const bioCandidate = windowEl.querySelector(
    "[data-dgca-bio-host], .biography, [data-tab='bio'], [data-tab='cv']",
  );

  return {
    titleBar: titleBar as HTMLElement,
    modalHost: modalHost as HTMLElement,
    bioHost: bioCandidate instanceof HTMLElement ? bioCandidate : undefined,
  };
}

function assessActorCompleteness(actorSource: unknown): "green" | "amber" | "red" | null {
  try {
    const imported = importFoundryDeltaGreen(JSON.stringify(actorSource));
    if (imported.blocked || imported.output === undefined) {
      return imported.completeness;
    }
    return assessAgentSnapshot(imported.output as AgentSnapshot).completeness;
  } catch {
    return null;
  }
}

/**
 * Register Agent-sheet title-bar Completeness lamp + Import modal (#9/#28).
 * No sheet tabs or system schema changes.
 */
export function registerFoundryModule(input: RegisterFoundryModuleInput): void {
  const cleanups = new WeakMap<object, () => void>();

  const attach = (sheet: FoundrySheetLike): void => {
    const game = input.getGame();
    const actor = sheet.actor;
    const user = game.user;
    const hostRoot = asHtmlElement(sheet.element);
    if (!actor || !user || !hostRoot) {
      return;
    }

    const sheetContext = {
      documentName: "Actor",
      actorType: actor.type,
      systemId: game.system?.id ?? "",
      systemVersion: game.system?.version ?? "",
      coreVersion: game.version ?? "",
    };
    if (!isSupportedAgentSheet(sheetContext)) {
      return;
    }

    cleanups.get(sheet)?.();

    const runtime = createFoundryActorRuntime({ actor, user });
    const sheetCompleteness = assessActorCompleteness(runtime.readActorSource());
    const session = createImportWizardSession({
      runtime,
      sheet: sheetContext,
      options: {
        ...(input.adapterVersion !== undefined ? { adapterVersion: input.adapterVersion } : {}),
        ...(sheetCompleteness !== null ? { sheetCompleteness } : {}),
      },
    });

    const slots = ensureChromeSlots(hostRoot);
    const dispose = mountImportWizardUi({
      host: session,
      titleBar: slots.titleBar,
      modalHost: slots.modalHost,
      ...(slots.bioHost ? { bioHost: slots.bioHost } : {}),
    });
    cleanups.set(sheet, dispose);
  };

  input.hooks.on(
    "renderActorSheet",
    ((sheet: FoundrySheetLike) => {
      attach(sheet);
    }) as (...args: never[]) => unknown,
  );
  input.hooks.on(
    "renderDocumentSheet",
    ((sheet: FoundrySheetLike) => {
      attach(sheet);
    }) as (...args: never[]) => unknown,
  );
}
