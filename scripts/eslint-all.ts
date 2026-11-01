import { ESLint } from "eslint";

import { summarise } from "./eslint-ratchet.ts";

/**
ESLint per workspace, one process each: type-aware linting of every project in a single
process outgrows the CI runner's memory. Each part keeps its own cache; extra arguments
(e.g. `--fix`) are passed through.

Every part is zero-tolerance for errors and warnings, except for the `pace/no-raw-design-values`
backlog: the app part must report exactly `DESIGN_VALUE_WARNINGS` of them (see
`eslint-ratchet.ts`). Results come back as JSON and are printed with ESLint's stylish formatter.
*/

/**
The `pace/no-raw-design-values` backlog (redesign-plan, "Lint baseline"). An exact ratchet: more
warnings fail, fewer fail too until this number is lowered to the new count. At 0 the rule
becomes an error and this allowance goes away.
*/
const DESIGN_VALUE_WARNINGS = 448;

const PARTS: readonly (readonly [string, readonly string[], number])[] = [
  ["packages", ["packages"], 0],
  ["api", ["apps/api"], 0],
  ["app", ["apps/app"], DESIGN_VALUE_WARNINGS],
  ["root", [".", "--ignore-pattern", "apps/**", "--ignore-pattern", "packages/**"], 0],
];

const extra = process.argv.slice(2);
const stylish = await new ESLint().loadFormatter("stylish");

for (const [name, targets, allowance] of PARTS) {
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
  const { problem } = summarise(results, allowance);
  if (problem === undefined && run.exitCode === 0) {
    continue;
  }

  console.error("eslint failed in", name, problem ?? "");
  process.exit(run.exitCode === 0 ? 1 : run.exitCode);
}
