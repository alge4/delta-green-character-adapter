/**
 * PROTOTYPE facsimile of the upstream Delta Green Agent sheet (Program style).
 * Approximates layout only — not a fork of system templates.
 */

import type { ReactNode } from "react";
import type { Completeness, PrototypeState } from "../mock/scenario";

export type SheetTab =
  | "skills"
  | "physical"
  | "motivations"
  | "gear"
  | "bio"
  | "bonds"
  | "interchange"
  | "about";

const BASE_TABS: { id: SheetTab; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "physical", label: "Physical" },
  { id: "motivations", label: "Mental" },
  { id: "gear", label: "Gear" },
  { id: "bio", label: "CV" },
  { id: "bonds", label: "Contacts" },
  { id: "about", label: "?" },
];

export function CompletenessDot({
  value,
  size = "md",
  label,
}: {
  value: Completeness;
  size?: "sm" | "md" | "lg";
  label?: boolean;
}) {
  return (
    <span className={`completeness completeness-${size}`} title={`Completeness: ${value}`}>
      <span className={`completeness-lamp ${value}`} />
      {label ? <span className="completeness-text">{value}</span> : null}
    </span>
  );
}

type Props = {
  state: PrototypeState;
  activeTab: SheetTab;
  onTabChange: (tab: SheetTab) => void;
  /** Extra tabs inserted before About (e.g. Interchange). */
  extraTabs?: { id: SheetTab; label: string }[];
  /** Content in the Foundry window title bar (right side). */
  titleBarExtra?: ReactNode;
  /** Overlay drawn above sheet content (modal/drawer host). */
  overlay?: ReactNode;
  /** Replaces the active tab body when provided. */
  tabBody?: ReactNode;
  /** Injected into the Bio/CV grid (module-owned DOB, etc.). */
  bioExtra?: ReactNode;
  /** Left-bar footer slot (variant-specific). */
  leftBarExtra?: ReactNode;
};

export function MockAgentSheet({
  state,
  activeTab,
  onTabChange,
  extraTabs = [],
  titleBarExtra,
  overlay,
  tabBody,
  bioExtra,
  leftBarExtra,
}: Props) {
  const tabs = [
    ...BASE_TABS.slice(0, -1),
    ...extraTabs,
    BASE_TABS[BASE_TABS.length - 1]!,
  ];

  return (
    <div className="foundry-window">
      <div className="foundry-titlebar">
        <span className="foundry-title">
          {state.actorName} — Agent Sheet
          {state.boundAgentId ? (
            <span className="bound-chip" title="Actor Binding">
              bound
            </span>
          ) : null}
        </span>
        <div className="foundry-titlebar-actions">{titleBarExtra}</div>
        <span className="foundry-window-controls" aria-hidden>
          — □ ×
        </span>
      </div>

      <div className="sheet program-style">
        <aside className="left-bar">
          <div className="portrait" aria-hidden />
          <input className="name-field" readOnly value={state.actorName} />
          <input className="profession-field" readOnly value={state.profession} />

          <div className="stats-grid">
            {(["STR", "CON", "DEX", "INT", "POW", "CHA"] as const).map((stat, i) => (
              <div key={stat} className="stat-cell">
                <span>{stat}</span>
                <strong>{[12, 11, 14, 13, 10, 11][i]}</strong>
              </div>
            ))}
          </div>

          <div className="resources">
            <div>
              <span>HP</span>
              <strong>6 / 12</strong>
            </div>
            <div>
              <span>WP</span>
              <strong>10 / 10</strong>
            </div>
            <div>
              <span>SAN</span>
              <strong>50 / 50</strong>
            </div>
          </div>

          {leftBarExtra}
        </aside>

        <section className="right-bar">
          <nav className="sheet-tabs" aria-label="Agent sheet tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "active" : undefined}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="tab-body">
            {tabBody ?? (
              <DefaultTabBody tab={activeTab} state={state} bioExtra={bioExtra} />
            )}
          </div>
        </section>

        {overlay}
      </div>
    </div>
  );
}

function DefaultTabBody({
  tab,
  state,
  bioExtra,
}: {
  tab: SheetTab;
  state: PrototypeState;
  bioExtra?: ReactNode;
}) {
  if (tab === "bio") {
    return (
      <div className="bio-panel">
        <div className="section-divider">Personal Info / CV</div>
        <div className="bio-grid">
          <label>Sex</label>
          <input readOnly value="M" />
          <label>Age</label>
          <input readOnly value="38" />
          <label>Employer</label>
          <input readOnly value="FBI" />
          <label>Nationality</label>
          <input readOnly value="American" />
          <label>Education</label>
          <input readOnly value="B.S. Criminal Justice" />
        </div>
        {bioExtra}
        <p className="muted">
          Upstream schema exposes Age as a string field only. Date of birth — when present —
          must live in module-owned data, not by extending the system schema.
        </p>
        {state.moduleOwned.dateOfBirth ? (
          <p className="module-owned-note">
            Module-owned DOB currently stored: <code>{state.moduleOwned.dateOfBirth}</code>
          </p>
        ) : null}
      </div>
    );
  }

  if (tab === "skills") {
    return (
      <div>
        <div className="section-divider">Skills (facsimile)</div>
        <ul className="skill-list">
          <li>Alertness — 50% <em className="fail">failed</em></li>
          <li>Bureaucracy — 40%</li>
          <li>Firearms — 50%</li>
          <li>HumInt — 60%</li>
          <li>Occult — <em className="omit">omitted in source</em></li>
        </ul>
      </div>
    );
  }

  return (
    <div>
      <div className="section-divider">{tab} (facsimile)</div>
      <p className="muted">
        Upstream Delta Green sheet content stays as-is. This prototype only explores the
        Character Adapter import surface.
      </p>
    </div>
  );
}
