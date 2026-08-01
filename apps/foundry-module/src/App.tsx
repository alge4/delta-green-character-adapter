/**
 * PROTOTYPE — Foundry Agent-sheet import integration (issue #9)
 *
 * Three variants of the settings/import surface, switchable via ?variant=
 * on this throwaway route. Sub-shape B: no existing Foundry module page yet.
 */

import { useEffect, useState } from "react";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import { VariantA, variantMeta as metaA } from "./variants/VariantA";
import { VariantB, variantMeta as metaB } from "./variants/VariantB";
import { VariantC, variantMeta as metaC } from "./variants/VariantC";

const VARIANTS = [metaA, metaB, metaC];

function readVariant(): string {
  const raw = new URLSearchParams(window.location.search).get("variant") ?? "A";
  return VARIANTS.some((v) => v.key === raw) ? raw : "A";
}

export function App() {
  const [variant, setVariant] = useState(readVariant);

  useEffect(() => {
    const sync = () => setVariant(readVariant());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return (
    <>
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}
