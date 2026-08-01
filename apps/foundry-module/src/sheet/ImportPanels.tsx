import type { ReactNode } from "react";
import type {
  Diagnostic,
  PlanEntry,
  PrototypeState,
  RemediationAction,
} from "../mock/scenario";
import {
  advanceToPlan,
  applyPlan,
  pickSource,
  resetFlow,
  setResolution,
  togglePlanEntry,
} from "../mock/scenario";
import { CompletenessDot } from "./MockAgentSheet";

type Handlers = {
  state: PrototypeState;
  setState: (next: PrototypeState) => void;
};

export function SourcePicker({ state, setState }: Handlers) {
  return (
    <div className="panel">
      <h3>Import source</h3>
      <p className="muted">
        Stub picker — production would accept canonical JSON / builder export / file drop.
      </p>
      <button type="button" className="primary" onClick={() => setState(pickSource(state))}>
        Use sample: Caleb
      </button>
      {state.sourceLabel ? (
        <p className="source-label">
          Source: <strong>{state.sourceLabel}</strong>
        </p>
      ) : null}
    </div>
  );
}

export function DiagnosticsPanel({ state, setState }: Handlers) {
  if (state.diagnostics.length === 0) {
    return (
      <div className="panel">
        <h3>Diagnostics</h3>
        <p className="muted">No diagnostics yet — pick a source.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-heading">
        <h3>Diagnostics</h3>
        <CompletenessDot value={state.completeness} label />
      </div>
      <ul className="diag-list">
        {state.diagnostics.map((d) => (
          <DiagnosticRow
            key={d.id}
            diagnostic={d}
            selected={state.resolutions[d.id]}
            onSelect={(action) => setState(setResolution(state, d.id, action))}
          />
        ))}
      </ul>
      <div className="panel-actions">
        <button type="button" className="primary" onClick={() => setState(advanceToPlan(state))}>
          Continue to Update Plan
        </button>
      </div>
    </div>
  );
}

function DiagnosticRow({
  diagnostic,
  selected,
  onSelect,
}: {
  diagnostic: Diagnostic;
  selected?: RemediationAction;
  onSelect: (action: RemediationAction) => void;
}) {
  return (
    <li className={`diag severity-${diagnostic.severity}`}>
      <div className="diag-meta">
        <span className="severity">{diagnostic.severity}</span>
        <span className="impact">completeness: {diagnostic.completenessImpact}</span>
        <code>{diagnostic.code}</code>
      </div>
      <p>{diagnostic.message}</p>
      <p className="path">{diagnostic.path}</p>
      <div className="remediation">
        {diagnostic.remediation.map((action) => (
          <button
            key={action}
            type="button"
            className={selected === action ? "selected" : undefined}
            onClick={() => onSelect(action)}
          >
            {action}
          </button>
        ))}
      </div>
    </li>
  );
}

export function UpdatePlanPanel({ state, setState }: Handlers) {
  if (state.plan.length === 0) {
    return (
      <div className="panel">
        <h3>Update Plan</h3>
        <p className="muted">Plan appears after diagnostics are addressed.</p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Update Plan</h3>
      <p className="muted">
        Profile updates selected by default. Mutable campaign state preserved unless you opt in.
      </p>
      <ul className="plan-list">
        {state.plan.map((entry) => (
          <PlanRow
            key={entry.id}
            entry={entry}
            selected={state.planSelection[entry.id] ?? false}
            onToggle={() => setState(togglePlanEntry(state, entry.id))}
          />
        ))}
      </ul>
      <div className="panel-actions">
        <button type="button" onClick={() => setState({ ...state, phase: "remediating", lastAction: "back to diagnostics" })}>
          Back
        </button>
        <button type="button" className="primary" onClick={() => setState(applyPlan(state))}>
          Apply selected changes
        </button>
      </div>
    </div>
  );
}

function PlanRow({
  entry,
  selected,
  onToggle,
}: {
  entry: PlanEntry;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <li className={`plan-row class-${entry.updateClass}`}>
      <label>
        <input type="checkbox" checked={selected} onChange={onToggle} />
        <span className="op">{entry.operation}</span>
        <code>{entry.path}</code>
      </label>
      <div className="plan-values">
        <span className="before">{entry.before}</span>
        <span aria-hidden>→</span>
        <span className="proposed">{entry.proposed}</span>
      </div>
      <div className="plan-meta">
        <span className="update-class">{entry.updateClass}</span>
        <span className="muted">{entry.reason}</span>
      </div>
    </li>
  );
}

export function AppliedSummary({ state, setState }: Handlers) {
  return (
    <div className="panel success-panel">
      <h3>Applied</h3>
      <p>
        Binding: <code>{state.boundAgentId ?? "(none)"}</code>
      </p>
      <p>
        Module-owned DOB: <code>{state.moduleOwned.dateOfBirth ?? "(not stored)"}</code>
      </p>
      <p>
        Completeness: <CompletenessDot value={state.completeness} label />
      </p>
      <button type="button" onClick={() => setState(resetFlow(state))}>
        Reset prototype flow
      </button>
    </div>
  );
}

export function FlowBody({ state, setState }: Handlers) {
  if (state.phase === "idle") return <SourcePicker state={state} setState={setState} />;
  if (state.phase === "remediating" || state.phase === "diagnosing" || state.phase === "source-picked") {
    return <DiagnosticsPanel state={state} setState={setState} />;
  }
  if (state.phase === "reviewing-plan") {
    return <UpdatePlanPanel state={state} setState={setState} />;
  }
  if (state.phase === "applied") {
    return <AppliedSummary state={state} setState={setState} />;
  }
  return <SourcePicker state={state} setState={setState} />;
}

export function ModuleOwnedDobField({
  state,
  emphasis = "inline",
}: {
  state: PrototypeState;
  emphasis?: "inline" | "panel";
}) {
  const value = state.moduleOwned.dateOfBirth;
  if (emphasis === "panel") {
    return (
      <div className="panel module-owned-panel">
        <h3>Module-owned fields</h3>
        <label>
          Date of birth
          <input readOnly value={value ?? ""} placeholder="(not imported yet)" />
        </label>
        <p className="muted">
          Stored at <code>flags.deltaGreenCharacterAdapter.moduleOwned.dateOfBirth</code> —
          upstream <code>system.biography</code> is unchanged.
        </p>
      </div>
    );
  }

  return (
    <div className="bio-module-owned">
      <label>Date of birth</label>
      <input
        readOnly
        value={value ?? ""}
        placeholder="module-owned — not in system schema"
      />
      <span className="module-tag">module</span>
    </div>
  );
}

export function StateDump({ state }: { state: PrototypeState }) {
  return (
    <aside className="state-dump" aria-label="Prototype state">
      <h2>Prototype state</h2>
      <pre>{JSON.stringify(summarize(state), null, 2)}</pre>
    </aside>
  );
}

function summarize(state: PrototypeState) {
  return {
    variant: state.variant,
    phase: state.phase,
    lastAction: state.lastAction,
    completeness: state.completeness,
    boundAgentId: state.boundAgentId,
    profession: state.profession,
    moduleOwned: state.moduleOwned,
    sourceLabel: state.sourceLabel,
    resolutions: state.resolutions,
    planSelection: state.planSelection,
    diagnosticCount: state.diagnostics.length,
    planCount: state.plan.length,
  };
}

export function PrototypeShell({
  title,
  children,
  state,
}: {
  title: string;
  children: ReactNode;
  state: PrototypeState;
}) {
  return (
    <div className="prototype-page">
      <header className="prototype-banner">
        <strong>PROTOTYPE</strong> — {title}
        <span className="muted"> issue #9 · throwaway · in-memory only</span>
      </header>
      <div className="prototype-layout">
        {children}
        <StateDump state={state} />
      </div>
    </div>
  );
}
