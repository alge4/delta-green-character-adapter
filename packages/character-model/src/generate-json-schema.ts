import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { generateAgentJsonSchema } from "./json-schema.js";

const outputUrl = new URL("./agent-schema-1.0.0.json", import.meta.url);
await writeFile(
  fileURLToPath(outputUrl),
  `${JSON.stringify(generateAgentJsonSchema(), null, 2)}\n`,
  "utf8",
);
