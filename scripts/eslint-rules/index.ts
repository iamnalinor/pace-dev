import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { kitPrimitives } from "./kit-primitives.ts";
import { noRawDesignValues } from "./no-raw-design-values.ts";
import { promiseFunctionAsync } from "./promise-function-async.ts";

/**
The version is a hash of the rule's sources: ESLint's cache key includes the plugin's
`meta.version`, so editing a rule invalidates `.cache/eslint` instead of serving stale results.
*/
const SOURCES = [
  "kit-primitives.ts",
  "no-raw-design-values.ts",
  "ast.ts",
  "class-checks.ts",
  "colors.ts",
  "motion-checks.ts",
  "promise-function-async.ts",
];
const hash = createHash("sha256");
for (const file of SOURCES) {
  hash.update(readFileSync(new URL(file, import.meta.url)));
}

/** The `pace` ESLint plugin: project-specific rules, registered in eslint.config.ts. */
export const plugin = {
  meta: { name: "pace", version: hash.digest("hex").slice(0, 12) },
  rules: {
    "kit-primitives": kitPrimitives,
    "no-raw-design-values": noRawDesignValues,
    "promise-function-async": promiseFunctionAsync,
  },
};
