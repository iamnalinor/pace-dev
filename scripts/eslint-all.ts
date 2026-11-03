import { ESLint } from "eslint";

import {
  BARE_PRESSABLE_RULE,
  DESIGN_VALUE_RULE,
  type Ratchet,
  summarise,
} from "./eslint-ratchet.ts";

/**
ESLint per workspace, one process each: type-aware linting of every project in a single
process outgrows the CI runner's memory. Each part keeps its own cache; extra arguments
(e.g. `--fix`) are passed through.

Every part is zero-tolerance for errors and warnings, except for two backlogs in the app part,
each an exact ratchet (see `eslint-ratchet.ts`): `pace/no-raw-design-values` must report exactly
`DESIGN_VALUE_WARNINGS`, the bare-pressable `no-restricted-imports` exactly
`BARE_PRESSABLE_WARNINGS`. Results come back as JSON and are printed with ESLint's stylish formatter.
*/

/**
The `pace/no-raw-design-values` backlog (redesign-plan, "Lint baseline"). An exact ratchet: more
warnings fail, fewer fail too until this number is lowered to the new count. At 0 the rule
becomes an error and this allowance goes away.
*/
const DESIGN_VALUE_WARNINGS = 74;

/**
The bare-pressable backlog (bug-lessons F-CMP-01: a React Native `Pressable`/`Touchable*` in
`src/features` or `src/shared` instead of `#app/ui/pressable`). Exact, like the one above; the kit
tasks migrate the callers and lower it; at 0 the rule becomes an error.
*/
const BARE_PRESSABLE_WARNINGS = 33;

const APP_RATCHETS: readonly Ratchet[] = [
  { allowance: DESIGN_VALUE_WARNINGS, constant: "DESIGN_VALUE_WARNINGS", rule: DESIGN_VALUE_RULE },
  {
    allowance: BARE_PRESSABLE_WARNINGS,
    constant: "BARE_PRESSABLE_WARNINGS",
    rule: BARE_PRESSABLE_RULE,
  },
];

const PARTS: readonly (readonly [string, readonly string[], readonly Ratchet[]])[] = [
  ["packages", ["packages"], []],
  ["api", ["apps/api"], []],
  ["app", ["apps/app"], APP_RATCHETS],
  ["root", [".", "--ignore-pattern", "apps/**", "--ignore-pattern", "packages/**"], []],
];

const extra = process.argv.slice(2);
const stylish = await new ESLint().loadFormatter("stylish");

for (const [name, targets, ratchets] of PARTS) {
  const run = Bun.spawnSync(
    [
      "bunx",
      "eslint",
      ...targets,
      "--format",
      "json",
      "--cache",
      "--cache-location",
      `.cache/eslint/${name}/`,
      ...extra,
    ],
    { stderr: "inherit", stdout: "pipe" },
  );

  let results: ESLint.LintResult[];
  try {
    results = JSON.parse(run.stdout.toString()) as ESLint.LintResult[];
  } catch {
    console.error(`eslint failed in ${name} (no report):\n${run.stdout.toString()}`);
    process.exit(run.exitCode === 0 ? 1 : run.exitCode);
  }

  const output = await stylish.format(results);
  if (output !== "") {
    console.log(output);
  }
  const { problem } = summarise(results, ratchets);
  if (problem === undefined && run.exitCode === 0) {
    continue;
  }

  console.error("eslint failed in", name, problem ?? "");
  process.exit(run.exitCode === 0 ? 1 : run.exitCode);
}
