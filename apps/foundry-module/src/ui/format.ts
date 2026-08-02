/** Browser-safe summary formatter — keeps the UI free of Node-only adapter packages. */
export type UiSafeValueSummary =
  | { readonly kind: "omitted" }
  | { readonly kind: "redacted"; readonly reason: string }
  | { readonly kind: "type"; readonly typeName: string }
  | { readonly kind: "scalar"; readonly typeName: string; readonly preview: string };

export type UiPlanEntry = {
  readonly operation: string;
  readonly path: string;
};

export function formatSafeSummary(summary: UiSafeValueSummary): string {
  switch (summary.kind) {
    case "omitted":
      return "(none)";
    case "redacted":
      return `[redacted: ${summary.reason}]`;
    case "type":
      return `(${summary.typeName})`;
    case "scalar":
      return summary.preview;
    default: {
      const _exhaustive: never = summary;
      return String(_exhaustive);
    }
  }
}

export function formatPlanEntryLabel(entry: UiPlanEntry): string {
  return `${entry.operation} ${entry.path}`;
}
