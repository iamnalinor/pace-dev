import { ESLint } from "eslint";

import {
  BARE_PRESSABLE_MARKER,
  BARE_PRESSABLE_RULE,
  DESIGN_VALUE_RULE,
  KIT_PRIMITIVE_RULE,
  type Ratchet,
  summarise,
} from "./eslint-ratchet.ts";

/**
ESLint per workspace, one process each: type-aware linting of every project in a single
process outgrows the CI runner's memory. Each part keeps its own cache; extra arguments
(e.g. `--fix`) are passed through.

Every part is zero-tolerance for errors and warnings, except for three backlogs in the app part,
each an exact ratchet (see `eslint-ratchet.ts`): `pace/no-raw-design-values` must report exactly
`DESIGN_VALUE_WARNINGS`, the bare-pressable `no-restricted-imports` exactly
`BARE_PRESSABLE_WARNINGS`, `pace/kit-primitives` exactly `KIT_PRIMITIVE_WARNINGS`. Results come back as JSON and are printed with ESLint's stylish formatter.
*/

/**
The `pace/no-raw-design-values` backlog (redesign-plan, "Lint baseline"). An exact ratchet: more
warnings fail, fewer fail too until this number is lowered to the new count. At 0 the rule
becomes an error and this allowance goes away.
*/
const DESIGN_VALUE_WARNINGS = 39;

/**
The bare-pressable backlog (bug-lessons F-CMP-01: a React Native `Pressable`/`Touchable*` in
`src/features` or `src/shared` instead of `#app/ui/pressable`). Exact, like the one above; the kit
tasks migrate the callers and lower it; at 0 the rule becomes an error.
*/
const BARE_PRESSABLE_WARNINGS = 19;

/**
The kit-primitive backlog (bug-lessons 109; spec §4.1.2 rule 9): a lucide icon outside the kit's
`Icon`, or `numberOfLines` on React Native's `Text` outside the kit's `Text`. Exact, like the ones
above; the screen tasks migrate the callers and lower it; at 0 the rule becomes an error.
*/
const KIT_PRIMITIVE_WARNINGS = 5;

const APP_RATCHETS: readonly Ratchet[] = [
  { allowance: DESIGN_VALUE_WARNINGS, constant: "DESIGN_VALUE_WARNINGS", rule: DESIGN_VALUE_RULE },
  {
    allowance: BARE_PRESSABLE_WARNINGS,
    constant: "BARE_PRESSABLE_WARNINGS",
    marker: BARE_PRESSABLE_MARKER,
    rule: BARE_PRESSABLE_RULE,
  },
  {
    allowance: KIT_PRIMITIVE_WARNINGS,
    constant: "KIT_PRIMITIVE_WARNINGS",
    rule: KIT_PRIMITIVE_RULE,
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
  // ESLint cuts a long report short when it exits into a pipe, so it writes the report to a file.
  const report = `.cache/eslint/${name}.json`;
  const run = Bun.spawnSync(
    [
      "bunx",
      "eslint",
      ...targets,
      "--format",
      "json",
      "--output-file",
      report,
      "--cache",
      "--cache-location",
      `.cache/eslint/${name}/`,
      ...extra,
    ],
    { stderr: "inherit", stdout: "inherit" },
  );

  let results: ESLint.LintResult[];
  try {
    results = JSON.parse(await Bun.file(report).text()) as ESLint.LintResult[];
  } catch {
    console.error(`eslint failed in ${name} (no report)`);
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
