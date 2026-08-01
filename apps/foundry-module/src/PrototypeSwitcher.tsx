import { useEffect } from "react";

export type VariantOption = { key: string; name: string };

type Props = {
  variants: VariantOption[];
  current: string;
};

/**
 * Floating prototype switcher — hidden in production builds.
 * Left/right arrows + keyboard ← → cycle ?variant=.
 */
export function PrototypeSwitcher({ variants, current }: Props) {
  if (import.meta.env.PROD) return null;

  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const currentVariant = variants[index] ?? variants[0]!;

  const go = (nextIndex: number) => {
    const wrapped = (nextIndex + variants.length) % variants.length;
    const key = variants[wrapped]!.key;
    const url = new URL(window.location.href);
    url.searchParams.set("variant", key);
    window.history.replaceState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft") go(index - 1);
      if (event.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="prototype-switcher" role="navigation" aria-label="Prototype variants">
      <button type="button" aria-label="Previous variant" onClick={() => go(index - 1)}>
        ←
      </button>
      <span className="switcher-label">
        {currentVariant.key} — {currentVariant.name}
      </span>
      <button type="button" aria-label="Next variant" onClick={() => go(index + 1)}>
        →
      </button>
    </div>
  );
}
