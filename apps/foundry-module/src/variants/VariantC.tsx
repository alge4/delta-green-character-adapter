/**
 * Variant C — Status badge + side drawer
 *
 * Persistent completeness badge on the sheet edge. Import opens a non-modal
 * right drawer for the flow. DOB is always shown beside Age in Bio as a
 * module-tagged field (empty until imported).
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
  key: "C",
  name: "Status badge + side drawer",
};

export function VariantC() {
  const [state, setState] = useState<PrototypeState>(() => createInitialState("C"));
  const [tab, setTab] = useState<SheetTab>("bio");
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <PrototypeShell title={variantMeta.name} state={state}>
      <div className={`sheet-with-drawer ${drawerOpen ? "drawer-open" : ""}`}>
        <MockAgentSheet
          state={state}
          activeTab={tab}
          onTabChange={setTab}
          titleBarExtra={
            <button
              type="button"
              className="titlebar-import"
              onClick={() => {
                setDrawerOpen(true);
                setState({ ...state, lastAction: "opened import drawer" });
              }}
            >
              Import
            </button>
          }
          bioExtra={<ModuleOwnedDobField state={state} />}
          leftBarExtra={null}
        />

        <button
          type="button"
          className={`edge-badge ${state.completeness}`}
          title="Completeness Assessment — open interchange drawer"
          onClick={() => {
            setDrawerOpen(true);
            setState({ ...state, lastAction: "opened drawer via completeness badge" });
          }}
        >
          <CompletenessDot value={state.completeness} size="lg" />
          <span>{state.completeness}</span>
        </button>

        {drawerOpen ? (
          <aside className="side-drawer" aria-label="Import drawer">
            <div className="drawer-header">
              <h2>Interchange</h2>
              <CompletenessDot value={state.completeness} label />
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setDrawerOpen(false);
                  setState({ ...state, lastAction: "closed import drawer" });
                }}
              >
                Close
              </button>
            </div>
            <FlowBody state={state} setState={setState} />
            {state.phase !== "idle" && state.phase !== "applied" ? (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setState(resetFlow(state));
                  setDrawerOpen(false);
                }}
              >
                Cancel
              </button>
            ) : null}
          </aside>
        ) : null}
      </div>
    </PrototypeShell>
  );
}
