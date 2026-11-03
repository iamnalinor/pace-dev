// The root workspace has no vitest; Bun's runner exposes the same describe/it API.
import { describe, expect, it } from "bun:test";
import { ESLint, RuleTester } from "eslint";
import path from "node:path";
import { parser } from "typescript-eslint";

import { promiseFunctionAsync } from "./promise-function-async.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// Type-aware: the rule reads each function's return type.
const tester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      projectService: { allowDefaultProject: ["*.ts"] },
      tsconfigRootDir: import.meta.dirname,
    },
  },
});

const DECLARE = "declare let p: Promise<number>; declare let maybe: Promise<number> | undefined;";

tester.run("promise-function-async", promiseFunctionAsync, {
  invalid: [
    // A function that only ever returns a promise is made async, as upstream does.
    {
      code: `${DECLARE} export const f = (): Promise<number> => p;`,
      errors: [{ messageId: "missingAsync" }],
      output: `${DECLARE} export const f = async (): Promise<number> => p;`,
    },
    // A getter of "a promise or nothing": `async` would turn its `undefined` into a promise that
    // always answers, so a loop `while (get() !== undefined)` never ends (the `sync.hold` loop,
    // pr48 follow-up A8). Reported, never rewritten: the fix is an explicit return type.
    {
      code: `${DECLARE} export const g = { get: () => maybe };`,
      errors: [{ messageId: "missingAsyncHybridReturn" }],
      output: null,
    },
  ],
  valid: [
    `${DECLARE} export const f = async (): Promise<number> => await p;`,
    // The way out the message names: an explicit union return type.
    `${DECLARE} export const g = { get: (): Promise<number> | undefined => maybe };`,
  ],
});

describe("the config", () => {
  // A config that brought the upstream rule back would bring its fix back with it.
  it.each([
    "packages/client/src/sync-client.ts",
    "apps/api/src/worker.ts",
    "scripts/eslint-all.ts",
  ])("runs pace's rule and not upstream's on %s", async (file) => {
    const root = path.join(import.meta.dir, "../..");
    const config = (await new ESLint({ cwd: root }).calculateConfigForFile(
      path.join(root, file),
    )) as { readonly rules?: Readonly<Record<string, unknown>> };
    expect(config.rules?.["pace/promise-function-async"]).toEqual([2]);
    expect(config.rules?.["@typescript-eslint/promise-function-async"]).toBeUndefined();
  });
});
