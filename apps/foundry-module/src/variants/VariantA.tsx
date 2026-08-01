/**
 * Variant A — Header chrome + modal wizard
 *
 * Completeness lamp + Import live in the Foundry window title bar.
 * The whole import → remediate → Update Plan flow is a modal over the sheet.
 * Module-owned DOB appears in Bio after apply (and as a step note in the wizard).
 */

import { useState } from "react";
import {
  createInitialState,
  resetFlow,
  type PrototypeState,
} from "../mock/scenario";
import {
  FlowBody,
  ModuleOwnedDobField,
  PrototypeShell,
} from "../sheet/ImportPanels";
import { CompletenessDot, MockAgentSheet, type SheetTab } from "../sheet/MockAgentSheet";

export const variantMeta = {
  key: "A",
  name: "Header chrome + modal wizard",
};

export function VariantA() {
  const [state, setState] = useState<PrototypeState>(() => createInitialState("A"));
  const [tab, setTab] = useState<SheetTab>("skills");
  const [open, setOpen] = useState(false);

  const setStateAndMaybeOpen = (next: PrototypeState) => {
    setState(next);
    if (next.phase === "idle" && state.phase !== "idle") setOpen(false);
  };

  return (
    <PrototypeShell title={variantMeta.name} state={state}>
      <MockAgentSheet
        state={state}
        activeTab={tab}
        onTabChange={setTab}
        titleBarExtra={
          <>
            <CompletenessDot value={state.completeness} size="sm" label />
            <button
              type="button"
              className="titlebar-import"
              onClick={() => {
                setOpen(true);
                setState({ ...state, lastAction: "opened import modal" });
              }}
            >
              Import…
            </button>
          </>
        }
        bioExtra={<ModuleOwnedDobField state={state} />}
        overlay={
          open ? (
            <div className="modal-backdrop" role="presentation">
              <div className="modal" role="dialog" aria-label="Import Agent">
                <div className="modal-header">
                  <h2>Import into this Agent</h2>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setOpen(false);
                      setState({ ...state, lastAction: "closed import modal" });
                    }}
                  >
                    Close
                  </button>
                </div>
                <ol className="wizard-steps">
                  <li className={state.phase === "idle" ? "current" : "done"}>Source</li>
                  <li
                    className={
                      state.phase === "remediating" || state.phase === "diagnosing"
                        ? "current"
                        : state.phase === "reviewing-plan" || state.phase === "applied"
                          ? "done"
                          : undefined
                    }
                  >
                    Diagnostics
                  </li>
                  <li className={state.phase === "reviewing-plan" ? "current" : state.phase === "applied" ? "done" : undefined}>
                    Update Plan
                  </li>
                  <li className={state.phase === "applied" ? "current" : undefined}>Done</li>
                </ol>
                <FlowBody state={state} setState={setStateAndMaybeOpen} />
                {state.phase !== "idle" ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setState(resetFlow(state));
                      setOpen(false);
                    }}
                  >
                    Cancel import
                  </button>
                ) : null}
              </div>
            </div>
          ) : null
        }
      />
    </PrototypeShell>
  );
}
