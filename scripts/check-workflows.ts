/*
GitHub Actions rules that no test can see (bug class 46). A workflow reading every secret or
variable at once (`toJSON(secrets)`, `toJSON(vars)`) is held by GitHub for approval and never
starts (Deploy after #45); name each secret instead. Run by `bun lint`.
*/
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = ".github/workflows";
const WHOLE_CONTEXT = /\$\{\{[^}]*\btoJSON\(\s*(?:secrets|vars)\s*\)/u;

const problems = readdirSync(DIR)
  .filter((name) => /\.ya?ml$/u.test(name))
  .flatMap((name) =>
    readFileSync(path.join(DIR, name), "utf8")
      .split("\n")
      .map((line, index) => ({ line, place: `${DIR}/${name}:${String(index + 1)}` }))
      .filter(({ line }) => WHOLE_CONTEXT.test(line))
      .map(
        ({ place }) => `${place}: toJSON(secrets|vars) reads every value; name each one instead`,
      ),
  );

for (const problem of problems) {
  console.error(problem);
}
process.exit(problems.length > 0 ? 1 : 0);
