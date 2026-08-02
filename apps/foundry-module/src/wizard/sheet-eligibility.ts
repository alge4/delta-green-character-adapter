import {
  CORE_VERSION,
  SYSTEM_ID,
  SYSTEM_VERSION,
} from "@delta-green-character-adapter/adapter-foundry-deltagreen";

export type AgentSheetContext = {
  readonly documentName: string;
  readonly actorType: string;
  readonly systemId: string;
  readonly systemVersion: string;
  readonly coreVersion: string;
};

/**
 * Title-bar chrome and Import are limited to exact-runtime Delta Green Agent sheets (#9/#28).
 * Upstream NPC/vehicle sheets and adjacent versions stay unsupported.
 */
export function isSupportedAgentSheet(sheet: AgentSheetContext): boolean {
  return (
    sheet.documentName === "Actor" &&
    sheet.actorType === "agent" &&
    sheet.systemId === SYSTEM_ID &&
    sheet.systemVersion === SYSTEM_VERSION &&
    sheet.coreVersion === CORE_VERSION
  );
}
