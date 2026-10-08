/**
ESLint per workspace, one process each: type-aware linting of every project in a single
process outgrows the CI runner's memory. Each part keeps its own cache; extra arguments
(e.g. `--fix`) are passed through.
*/
const PARTS: readonly (readonly [string, readonly string[]])[] = [
  ["packages", ["packages"]],
  ["api", ["apps/api"]],
  ["app", ["apps/app"]],
  ["root", [".", "--ignore-pattern", "apps/**", "--ignore-pattern", "packages/**"]],
];

const extra = process.argv.slice(2);

for (const [name, targets] of PARTS) {
  const run = Bun.spawnSync(
    [
      "bunx",
      "eslint",
      ...targets,
      "--max-warnings",
      "0",
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
