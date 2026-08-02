import { registerFoundryModule } from "./register.js";

declare const Hooks: {
  once(event: string, fn: (...args: never[]) => unknown): void;
  on(event: string, fn: (...args: never[]) => unknown): void;
};

declare const game: {
  readonly system?: { readonly id?: string; readonly version?: string };
  readonly version?: string;
  readonly user?: unknown;
};

/**
 * Foundry module entrypoint. Loaded only inside a Foundry `14.365` + Delta Green `1.7.0` world.
 */
Hooks.once("ready", (() => {
  registerFoundryModule({
    hooks: Hooks,
    getGame: () => game as never,
  });
}) as (...args: never[]) => unknown);
