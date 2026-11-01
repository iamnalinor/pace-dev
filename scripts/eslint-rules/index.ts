import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { noRawDesignValues } from "./no-raw-design-values.ts";

/**
The version is a hash of the rule's sources: ESLint's cache key includes the plugin's
`meta.version`, so editing a rule invalidates `.cache/eslint` instead of serving stale results.
*/
const SOURCES = [
  "no-raw-design-values.ts",
  "ast.ts",
  "class-checks.ts",
  "colors.ts",
  "motion-checks.ts",
];
const hash = createHash("sha256");
for (const file of SOURCES) {
  hash.update(readFileSync(new URL(file, import.meta.url)));
}

/** The `pace` ESLint plugin: project-specific rules, registered in eslint.config.ts. */
export const plugin = {
  meta: { name: "pace", version: hash.digest("hex").slice(0, 12) },
  rules: { "no-raw-design-values": noRawDesignValues },
};
