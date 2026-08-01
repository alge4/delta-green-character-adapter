/**
 * Variant B — Interchange tab
 *
 * No chrome chrome buttons. A new sheet tab owns source pick, diagnostics,
 * remediation, Update Plan, completeness, and the module-owned fields panel.
 * Upstream tabs stay untouched.
 */

import { useState } from "react";
import { createInitialState, type PrototypeState } from "../mock/scenario";
import {
  FlowBody,
  ModuleOwnedDobField,
  PrototypeShell,
} from "../sheet/ImportPanels";
import { CompletenessDot, MockAgentSheet, type SheetTab } from "../sheet/MockAgentSheet";

export const variantMeta = {
  key: "B",
  name: "Interchange tab",
};

export function VariantB() {
  const [state, setState] = useState<PrototypeState>(() => createInitialState("B"));
  const [tab, setTab] = useState<SheetTab>("interchange");

  return (
    <PrototypeShell title={variantMeta.name} state={state}>
      <MockAgentSheet
        state={state}
        activeTab={tab}
        onTabChange={setTab}
        extraTabs={[{ id: "interchange", label: "Interchange" }]}
        leftBarExtra={
          <div className="left-completeness">
            <span>Adapter</span>
            <CompletenessDot value={state.completeness} label />
          </div>
        }
        tabBody={
          tab === "interchange" ? (
            <div className="interchange-tab">
              <div className="section-divider">Character Adapter</div>
              <p className="lede">
                Import, remediate, and review updates without leaving the Agent sheet.
                Upstream Delta Green tabs are unchanged.
              </p>
              <div className="interchange-columns">
                <FlowBody state={state} setState={setState} />
                <ModuleOwnedDobField state={state} emphasis="panel" />
              </div>
            </div>
          ) : undefined
        }
        bioExtra={
          state.moduleOwned.dateOfBirth ? (
            <ModuleOwnedDobField state={state} />
          ) : undefined
        }
      />
    </PrototypeShell>
  );
}
