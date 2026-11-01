/**
ESLint per workspace, one process each: type-aware linting of every project in a single
process outgrows the CI runner's memory. Each part keeps its own cache; extra arguments
(e.g. `--fix`) are passed through.
*/
/**
Warnings tolerated per part: the `pace/no-raw-design-values` backlog (redesign-plan, "Lint
baseline"). A ratchet — lower it with every migration, never raise it; at 0 the rule becomes
an error and this allowance goes away.
*/
const DESIGN_VALUE_WARNINGS = 425;

const PARTS: readonly (readonly [string, readonly string[], number])[] = [
  ["packages", ["packages"], 0],
  ["api", ["apps/api"], 0],
  ["app", ["apps/app"], DESIGN_VALUE_WARNINGS],
  ["root", [".", "--ignore-pattern", "apps/**", "--ignore-pattern", "packages/**"], 0],
];

const extra = process.argv.slice(2);

for (const [name, targets, maxWarnings] of PARTS) {
  const run = Bun.spawnSync(
    [
      "bunx",
      "eslint",
      ...targets,
      "--max-warnings",
      String(maxWarnings),
      "--cache",
      "--cache-location",
      `.cache/eslint/${name}/`,
      ...extra,
    ],
    { stderr: "inherit", stdout: "inherit" },
  );
  if (run.exitCode === 0) {
    continue;
  }

  console.error(`eslint failed in ${name}`);
  process.exit(run.exitCode);
}
