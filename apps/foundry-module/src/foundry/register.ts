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

function placeTitleBarSlot(header: HTMLElement, titleBar: HTMLElement): void {
  // ApplicationV2 headers are a single flex row: title, then controls. Sit immediately
  // left of Toggle Controls (ellipsis) so Completeness/Import stay on that row (#40).
  const toggle =
    header.querySelector('[data-action="toggleControls"]') instanceof HTMLElement
      ? (header.querySelector('[data-action="toggleControls"]') as HTMLElement)
      : header.querySelector(".header-control") instanceof HTMLElement
        ? (header.querySelector(".header-control") as HTMLElement)
        : null;
  if (toggle?.parentElement === header) {
    header.insertBefore(titleBar, toggle);
    return;
  }
  header.append(titleBar);
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

  const header =
    windowEl.querySelector(".window-header, .application-header, header") instanceof HTMLElement
      ? (windowEl.querySelector(".window-header, .application-header, header") as HTMLElement)
      : windowEl;

  const existingTitleBar = windowEl.querySelector("[data-dgca-titlebar]");
  const titleBar =
    existingTitleBar instanceof HTMLElement
      ? existingTitleBar
      : (() => {
          const slot = document.createElement("div");
          slot.setAttribute("data-dgca-titlebar", "true");
          slot.className = "dgca-titlebar-actions";
          return slot;
        })();
  placeTitleBarSlot(header, titleBar);

  // Portal the wizard outside the ApplicationV2 <form>. In-sheet absolute overlays
  // overflow onto #board, so Continue/Apply clicks hit the canvas instead (#40).
  for (const legacy of windowEl.querySelectorAll("[data-dgca-modal-host]")) {
    legacy.remove();
  }
  const body = document.body;
  let modalHost =
    body instanceof HTMLElement
      ? Array.from(body.children).find(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.getAttribute("data-dgca-modal-host") === "true",
        )
      : undefined;
  if (!(modalHost instanceof HTMLElement)) {
    modalHost = document.createElement("div");
    modalHost.setAttribute("data-dgca-modal-host", "true");
    modalHost.setAttribute("data-dgca-modal-portal", "true");
    modalHost.className = "dgca-modal-host";
    if (body instanceof HTMLElement) {
      body.append(modalHost);
    } else {
      windowEl.append(modalHost);
    }
  }

  // Prefer ApplicationV2 tab *panels* (`data-application-part` / `.tab[data-tab]`).
  // Bare `[data-tab='bio']` matches the nav <a> first and mounts DOB chrome in the tab bar (#40).
  const bioCandidate = windowEl.querySelector(
    "[data-dgca-bio-host], [data-application-part='bio'], [data-application-part='cv'], .tab[data-tab='bio'], .tab[data-tab='cv']",
  );
  const bioHost = bioCandidate instanceof HTMLElement ? bioCandidate : undefined;
  if (bioHost && bioHost.getAttribute("data-dgca-bio-host") !== "true") {
    bioHost.setAttribute("data-dgca-bio-host", "true");
  }
  // Drop any prior mis-mounts (e.g. into Bio nav links from older selectors).
  for (const stray of windowEl.querySelectorAll("[data-dgca-module-owned]")) {
    if (stray instanceof HTMLElement && stray.parentElement !== bioHost) {
      stray.remove();
    }
  }

  return {
    titleBar: titleBar as HTMLElement,
    modalHost: modalHost as HTMLElement,
    bioHost,
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
 * Register Agent-sheet title-bar Completeness lamp + Import modal (#9/#28/#38).
 * Subscribes classic and ApplicationV2 sheet hooks; no sheet tabs or system schema changes.
 */
export function registerFoundryModule(input: RegisterFoundryModuleInput): void {
  const cleanups = new WeakMap<object, () => void>();
  // Keep the wizard session across sheet re-renders so apply is not torn down when
  // Actor#update refreshes the ApplicationV2 sheet mid-mutation (#40).
  const sessions = new WeakMap<object, ReturnType<typeof createImportWizardSession>>();

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

    let session = sessions.get(sheet);
    if (session === undefined) {
      const runtime = createFoundryActorRuntime({ actor, user });
      const sheetCompleteness = assessActorCompleteness(runtime.readActorSource());
      session = createImportWizardSession({
        runtime,
        sheet: sheetContext,
        options: {
          ...(input.adapterVersion !== undefined ? { adapterVersion: input.adapterVersion } : {}),
          ...(sheetCompleteness !== null ? { sheetCompleteness } : {}),
        },
      });
      sessions.set(sheet, session);
    }

    const slots = ensureChromeSlots(hostRoot);
    const dispose = mountImportWizardUi({
      host: session,
      titleBar: slots.titleBar,
      modalHost: slots.modalHost,
      ...(slots.bioHost ? { bioHost: slots.bioHost } : {}),
    });
    cleanups.set(sheet, dispose);
  };

  // Classic Application V1 sheet hooks (compat) plus ApplicationV2 hooks used by
  // Delta Green 1.7.0 DGAgentSheet (ActorSheetV2) on Foundry 14.365 (#37/#38).
  for (const event of [
    "renderActorSheet",
    "renderDocumentSheet",
    "renderActorSheetV2",
    "renderDocumentSheetV2",
  ] as const) {
    input.hooks.on(
      event,
      ((sheet: FoundrySheetLike) => {
        attach(sheet);
      }) as (...args: never[]) => unknown,
    );
  }
}
