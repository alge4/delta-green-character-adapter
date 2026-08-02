import { createHash } from "node:crypto";

import { stableStringify } from "./json.js";
import type { AdapterDiagnostic } from "./diagnostics.js";

export function fingerprintDiagnostic(diagnostic: AdapterDiagnostic): string {
  const identity = {
    code: diagnostic.code,
    paths: diagnostic.paths,
    entity: diagnostic.entity ?? null,
  };
  const digest = createHash("sha256").update(stableStringify(identity)).digest("hex");
  return `sha256:${digest}`;
}

function diagnosticSortKey(diagnostic: AdapterDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.paths.source ?? "",
    diagnostic.paths.canonical ?? "",
    diagnostic.paths.target ?? "",
    diagnostic.entity?.collection ?? "",
    diagnostic.entity?.id ?? "",
    diagnostic.message,
  ].join("\0");
}

export function sortDiagnostics(diagnostics: readonly AdapterDiagnostic[]): AdapterDiagnostic[] {
  return [...diagnostics].sort((left, right) => {
    const leftKey = diagnosticSortKey(left);
    const rightKey = diagnosticSortKey(right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}
