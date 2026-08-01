import * as z from "zod";

import { agentSnapshotSchema } from "./schemas.js";

export function generateAgentJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(agentSnapshotSchema, {
    target: "draft-2020-12",
    unrepresentable: "throw",
  });
  return {
    ...schema,
    $id: "https://delta-green-character-adapter.dev/schema/agent/1.0.0",
  };
}
