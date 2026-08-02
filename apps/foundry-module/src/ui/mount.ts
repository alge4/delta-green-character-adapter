import type { ImportWizardSession, ImportWizardView } from "../wizard/session.js";
import { formatPlanEntryLabel, formatSafeSummary } from "./format.js";

export type WizardHost = Pick<
  ImportWizardSession,
  | "view"
  | "open"
  | "close"
  | "cancel"
  | "loadLocalGreenSource"
  | "selectRemediation"
  | "acknowledgeGroup"
  | "continueToPlan"
  | "backToDiagnostics"
  | "setEntrySelected"
  | "acceptReplan"
  | "confirmApply"
  | "dismissRecovery"
> & {
  subscribe?(listener: () => void): () => void;
};

export type MountImportWizardOptions = {
  readonly host: WizardHost;
  /** Title-bar host for Completeness lamp + Import control. */
  readonly titleBar: HTMLElement;
  /** Overlay host for the modal wizard. */
  readonly modalHost: HTMLElement;
  /** Optional Bio tab slot for module-owned fields. */
  readonly bioHost?: HTMLElement;
  /** Optional file bytes provider for tests that skip the native file picker. */
  readonly readLocalFile?: (file: File) => Promise<string | Uint8Array>;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function completenessLamp(value: ImportWizardView["completeness"]): HTMLElement {
  const wrap = el("span", "dgca-completeness");
  const lamp = el("span", `dgca-completeness-lamp ${value ?? "unknown"}`);
  lamp.title = `Completeness Assessment: ${value ?? "unknown"}`;
  lamp.setAttribute("role", "img");
  lamp.setAttribute("aria-label", `Completeness Assessment: ${value ?? "unknown"}`);
  wrap.append(lamp, el("span", "dgca-completeness-text", value ?? "—"));
  return wrap;
}

async function resolveView(host: WizardHost): Promise<ImportWizardView> {
  return await Promise.resolve(host.view());
}

/**
 * Mount Variant A title-bar chrome + modal import wizard (#9/#28).
 * Preserves upstream sheet tabs/schema; only fills provided chrome slots.
 */
export function mountImportWizardUi(options: MountImportWizardOptions): () => void {
  const { host, titleBar, modalHost, bioHost } = options;
  const readLocalFile =
    options.readLocalFile ??
    (async (file: File) => new Uint8Array(await file.arrayBuffer()));

  let rendering = false;
  let fileInput: HTMLInputElement | null = null;

  const render = async (): Promise<void> => {
    if (rendering) {
      return;
    }
    rendering = true;
    try {
      const view = await resolveView(host);
      titleBar.replaceChildren();
      modalHost.replaceChildren();

      titleBar.append(completenessLamp(view.completeness));
      const importButton = el("button", "dgca-titlebar-import", "Import…");
      importButton.type = "button";
      importButton.disabled = !view.sheetEligible;
      importButton.addEventListener("click", () => {
        void Promise.resolve(host.open()).then(() => void render());
      });
      titleBar.append(importButton);

      if (bioHost) {
        // Preserve upstream Bio markup; only refresh our module-owned slot.
        let slot = bioHost.querySelector("[data-dgca-module-owned]");
        if (!(slot instanceof HTMLElement)) {
          slot = el("div", "dgca-bio-module-owned");
          slot.setAttribute("data-dgca-module-owned", "true");
          bioHost.append(slot);
        }
        slot.replaceChildren();
        const label = el("label", undefined, "Date of birth");
        const input = el("input");
        input.readOnly = true;
        input.value = view.moduleOwnedBio.dateOfBirth ?? "";
        input.placeholder = "module-owned — not in system schema";
        slot.append(label, input, el("span", "dgca-module-tag", "module"));
        if (view.moduleOwnedBio.aliases !== undefined && view.moduleOwnedBio.aliases.length > 0) {
          slot.append(
            el("p", "dgca-muted", `Aliases: ${view.moduleOwnedBio.aliases.join(", ")}`),
          );
        }
      }

      if (!view.open) {
        return;
      }

      const backdrop = el("div", "dgca-modal-backdrop");
      backdrop.setAttribute("role", "presentation");
      const modal = el("div", "dgca-modal");
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-label", "Import Agent");

      const header = el("div", "dgca-modal-header");
      header.append(el("h2", undefined, "Import into this Agent"));
      const close = el("button", "dgca-ghost", "Close");
      close.type = "button";
      close.addEventListener("click", () => {
        void Promise.resolve(host.close()).then(() => void render());
      });
      header.append(close);
      modal.append(header);

      const steps = el("ol", "dgca-wizard-steps");
      const stepDefs: Array<{ id: string; current: boolean; done: boolean }> = [
        {
          id: "Source",
          current: view.phase === "source",
          done: view.phase !== "source" && view.phase !== "closed",
        },
        {
          id: "Diagnostics",
          current: view.phase === "diagnostics",
          done:
            view.phase === "plan" ||
            view.phase === "applying" ||
            view.phase === "done" ||
            view.phase === "failed" ||
            view.phase === "recovery",
        },
        {
          id: "Update Plan",
          current: view.phase === "plan" || view.phase === "applying",
          done: view.phase === "done",
        },
        {
          id: "Done",
          current:
            view.phase === "done" || view.phase === "failed" || view.phase === "recovery",
          done: false,
        },
      ];
      for (const step of stepDefs) {
        const li = el("li", undefined, step.id);
        if (step.current) {
          li.classList.add("current");
        }
        if (step.done) {
          li.classList.add("done");
        }
        steps.append(li);
      }
      modal.append(steps);

      const body = el("div", "dgca-panel");
      if (view.progressMessage) {
        body.append(el("p", "dgca-progress", view.progressMessage));
      }

      if (view.phase === "source") {
        body.append(el("h3", undefined, "Import source"));
        body.append(
          el(
            "p",
            "dgca-muted",
            "Local Green Agent Creator 5c9e92d JSON only. Files stay on this machine; nothing is uploaded.",
          ),
        );
        fileInput = el("input");
        fileInput.type = "file";
        fileInput.accept = "application/json,.json";
        fileInput.setAttribute("data-testid", "dgca-source-file");
        fileInput.addEventListener("change", () => {
          const file = fileInput?.files?.[0];
          if (!file) {
            return;
          }
          void readLocalFile(file).then((bytes) =>
            Promise.resolve(
              host.loadLocalGreenSource({ bytes, fileName: file.name }),
            ).then(() => void render()),
          );
        });
        body.append(fileInput);
      }

      if (view.phase === "diagnostics") {
        body.append(el("h3", undefined, "Diagnostics"));
        body.append(completenessLamp(view.completeness));
        if (view.sourceLabel) {
          body.append(el("p", "dgca-source-label", `Source: ${view.sourceLabel}`));
        }
        const list = el("ul", "dgca-diag-list");
        for (const diagnostic of view.diagnostics) {
          const item = el("li", `dgca-diag severity-${diagnostic.severity}`);
          item.append(
            el(
              "div",
              "dgca-diag-meta",
              `${diagnostic.severity} · completeness: ${diagnostic.completenessImpact} · ${diagnostic.code}`,
            ),
          );
          item.append(el("p", undefined, diagnostic.message));
          const path =
            diagnostic.paths.canonical ??
            diagnostic.paths.target ??
            diagnostic.paths.source ??
            "";
          if (path) {
            item.append(el("p", "dgca-path", path));
          }
          if (diagnostic.acknowledgement.kind === "group") {
            const groupKey = diagnostic.acknowledgement.groupKey;
            if (view.pendingGroupAcknowledgements.includes(groupKey)) {
              const ack = el("button", "dgca-primary", `Acknowledge group: ${groupKey}`);
              ack.type = "button";
              ack.setAttribute("data-testid", `dgca-ack-${groupKey}`);
              ack.addEventListener("click", () => {
                void Promise.resolve(host.acknowledgeGroup(groupKey)).then(() => void render());
              });
              item.append(ack);
            } else {
              item.append(el("p", "dgca-muted", `Group acknowledged: ${groupKey}`));
            }
          }
          if (diagnostic.severity === "error" && diagnostic.remediations.length > 0) {
            const row = el("div", "dgca-remediation");
            for (const choice of diagnostic.remediations) {
              const button = el("button", undefined, choice.label);
              button.type = "button";
              button.addEventListener("click", () => {
                void Promise.resolve(
                  host.selectRemediation(diagnostic.fingerprint, choice.action, choice.parameters),
                ).then(() => void render());
              });
              row.append(button);
            }
            item.append(row);
          }
          list.append(item);
        }
        body.append(list);
        const actions = el("div", "dgca-panel-actions");
        const cont = el("button", "dgca-primary", "Continue to Update Plan");
        cont.type = "button";
        cont.disabled = !view.canContinueToPlan;
        cont.setAttribute("data-testid", "dgca-continue-plan");
        cont.addEventListener("click", () => {
          void Promise.resolve(host.continueToPlan()).then(() => void render());
        });
        actions.append(cont);
        body.append(actions);
      }

      if (view.phase === "plan" || view.phase === "applying") {
        body.append(el("h3", undefined, "Update Plan"));
        body.append(
          el(
            "p",
            "dgca-muted",
            "Profile updates are selected by default. Mutable campaign state is preserved unless you opt in. Confirm Actor Binding before dependents can apply.",
          ),
        );
        if (view.staleReplanRequired) {
          body.append(
            el(
              "p",
              "dgca-stale",
              "Actor state changed after planning. Review the replanned Update Plan, then confirm to re-enable apply.",
            ),
          );
          const acceptReplan = el("button", "dgca-primary", "Accept replanned Update Plan");
          acceptReplan.type = "button";
          acceptReplan.setAttribute("data-testid", "dgca-accept-replan");
          acceptReplan.addEventListener("click", () => {
            void Promise.resolve(host.acceptReplan()).then(() => void render());
          });
          body.append(acceptReplan);
        }
        if (view.plan) {
          const list = el("ul", "dgca-plan-list");
          for (const entry of view.plan.entries) {
            if (entry.fieldClass === "handlerOnly" && !view.handlerOnlyVisible) {
              continue;
            }
            const row = el("li", `dgca-plan-row class-${entry.fieldClass}`);
            const label = el("label");
            const checkbox = el("input");
            checkbox.type = "checkbox";
            checkbox.checked = view.selection[entry.id] === true;
            checkbox.disabled = view.phase === "applying";
            checkbox.setAttribute("data-testid", `dgca-plan-${entry.id}`);
            checkbox.addEventListener("change", () => {
              void Promise.resolve(host.setEntrySelected(entry.id, checkbox.checked)).then(
                () => void render(),
              );
            });
            label.append(checkbox, el("span", "dgca-op", formatPlanEntryLabel(entry)));
            row.append(label);
            row.append(
              el(
                "div",
                "dgca-plan-values",
                `${formatSafeSummary(entry.before)} → ${formatSafeSummary(entry.proposed)}`,
              ),
            );
            row.append(
              el("div", "dgca-plan-meta", `${entry.fieldClass} · ${entry.selectionReason}`),
            );
            if (entry.dependencies.length > 0) {
              row.append(
                el("p", "dgca-muted", `Depends on: ${entry.dependencies.join(", ")}`),
              );
            }
            list.append(row);
          }
          body.append(list);
        }
        const actions = el("div", "dgca-panel-actions");
        const back = el("button", "dgca-ghost", "Back");
        back.type = "button";
        back.disabled = view.phase === "applying";
        back.addEventListener("click", () => {
          void Promise.resolve(host.backToDiagnostics()).then(() => void render());
        });
        const apply = el("button", "dgca-primary", "Confirm and apply selected changes");
        apply.type = "button";
        apply.disabled = !view.canApply || view.phase === "applying";
        apply.setAttribute("data-testid", "dgca-apply");
        apply.addEventListener("click", () => {
          void Promise.resolve(host.confirmApply()).then(() => void render());
        });
        actions.append(back, apply);
        body.append(actions);
      }

      if (view.phase === "done") {
        body.append(el("h3", undefined, "Applied"));
        body.append(
          el(
            "p",
            undefined,
            `Completeness: ${view.completeness ?? "—"}. Module-owned DOB: ${view.moduleOwnedBio.dateOfBirth ?? "(not stored)"}.`,
          ),
        );
        const closeDone = el("button", "dgca-primary", "Close");
        closeDone.type = "button";
        closeDone.setAttribute("data-testid", "dgca-done-close");
        closeDone.addEventListener("click", () => {
          void Promise.resolve(host.close()).then(() => void render());
        });
        body.append(closeDone);
      }

      if (view.phase === "failed" || view.phase === "recovery") {
        body.append(el("h3", undefined, view.phase === "recovery" ? "Recovery required" : "Apply failed"));
        if (view.recoveryDisclosure) {
          body.append(el("p", undefined, view.recoveryDisclosure));
        }
        if (view.phase === "recovery") {
          body.append(
            el(
              "p",
              "dgca-muted",
              "A verified recovery snapshot is held in memory for authorized restore only. It is never written to Actor flags.",
            ),
          );
          const dismiss = el("button", "dgca-ghost", "Dismiss recovery offer");
          dismiss.type = "button";
          dismiss.addEventListener("click", () => {
            void Promise.resolve(host.dismissRecovery()).then(() => void render());
          });
          body.append(dismiss);
        }
      }

      modal.append(body);

      if (view.phase !== "source" && view.phase !== "done") {
        const cancel = el("button", "dgca-ghost", "Cancel import");
        cancel.type = "button";
        cancel.disabled = view.phase === "applying";
        cancel.addEventListener("click", () => {
          void Promise.resolve(host.cancel()).then(() => void render());
        });
        modal.append(cancel);
      }

      backdrop.append(modal);
      modalHost.append(backdrop);
    } finally {
      rendering = false;
    }
  };

  const unsubscribe = host.subscribe?.(() => {
    void render();
  });
  void render();

  return () => {
    unsubscribe?.();
    titleBar.replaceChildren();
    modalHost.replaceChildren();
    bioHost?.querySelector("[data-dgca-module-owned]")?.remove();
  };
}
