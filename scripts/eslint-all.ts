import { ESLint } from "eslint";

import { clearReport, readReport } from "./eslint-report.ts";

/**
ESLint per workspace, one process each: type-aware linting of every project in a single
process outgrows the CI runner's memory. Each part keeps its own cache; extra arguments
(e.g. `--fix`) are passed through.

Every part is zero-tolerance for errors and warnings. Results come back as JSON and are printed
with ESLint's stylish formatter.
*/

const PARTS: readonly (readonly [string, readonly string[]])[] = [
  ["packages", ["packages"]],
  ["api", ["apps/api"]],
  ["app", ["apps/app"]],
  ["updates", ["apps/updates"]],
  ["root", [".", "--ignore-pattern", "apps/**", "--ignore-pattern", "packages/**"]],
];

const extra = process.argv.slice(2);
const stylish = await new ESLint().loadFormatter("stylish");

for (const [name, targets] of PARTS) {
  // ESLint cuts a long report short when it exits into a pipe, so it writes the report to a file.
  const report = `.cache/eslint/${name}.json`;
  clearReport(report);
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

  const results = await readReport(report);
  if (results === undefined) {
    console.error(`eslint failed in ${name} (no fresh report)`);
    process.exit(run.exitCode === 0 ? 1 : run.exitCode);
  }

  const output = await stylish.format(results);
  if (output !== "") {
    console.log(output);
  }
  const warnings = results.reduce((total, result) => total + result.warningCount, 0);
  if (warnings === 0 && run.exitCode === 0) {
    continue;
  }

  console.error(
    "eslint failed in",
    name,
    warnings > 0 ? `${String(warnings)} warning(s): fix them.` : "",
  );
  process.exit(run.exitCode === 0 ? 1 : run.exitCode);
}
