import { ADAPTER_FLAG_NAMESPACE } from "@delta-green-character-adapter/adapter-foundry-deltagreen";

import { isRecord } from "../paths.js";

export type ModuleOwnedBioFields = {
  readonly dateOfBirth?: string;
  readonly aliases?: readonly string[];
};

/**
 * Surface canonical Bio fields the upstream schema cannot hold from module flags (#9/#28).
 * Does not read or mutate `system.biography`.
 */
export function readModuleOwnedBio(actorSource: unknown): ModuleOwnedBioFields {
  if (!isRecord(actorSource) || !isRecord(actorSource.flags)) {
    return {};
  }
  const adapter = actorSource.flags[ADAPTER_FLAG_NAMESPACE];
  if (!isRecord(adapter) || !isRecord(adapter.unrepresentable)) {
    return {};
  }
  const bag = adapter.unrepresentable;
  const result: {
    dateOfBirth?: string;
    aliases?: readonly string[];
  } = {};
  if (typeof bag.dateOfBirth === "string" && bag.dateOfBirth.length > 0) {
    result.dateOfBirth = bag.dateOfBirth;
  }
  if (Array.isArray(bag.aliases)) {
    const aliases = bag.aliases.filter((entry): entry is string => typeof entry === "string");
    if (aliases.length > 0) {
      result.aliases = aliases;
    }
  }
  return result;
}
