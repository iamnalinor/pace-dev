import { describe, expect, it } from "bun:test";
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import pathModule from "node:path";

import { err, ok } from "@pace/core";

import { withSecretFile } from "./secrets-file.ts";

const fixture = async (run: (directory: string) => Promise<void>) => {
  const directory = await mkdtemp(pathModule.join(tmpdir(), "pace-secret-test-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

describe("temporary deployment secret file", () => {
  it("writes exact JSON privately and cleans successful commands", async () => {
    await fixture(async (directory) => {
      const values = { FIREBASE_ANDROID_CONFIG: null, OTHER: "secret\nvalue" };
      const result = await withSecretFile(
        values,
        async (path) => {
          expect(JSON.parse(await readFile(path, "utf8"))).toEqual(values);
          expect((await stat(path)).mode & 0o777).toBe(0o600);
          expect((await stat(pathModule.join(path, ".."))).mode & 0o777).toBe(0o700);
          return ok("candidate-id");
        },
        directory,
      );
      expect(result).toEqual(ok("candidate-id"));
      expect(await readdir(directory)).toEqual([]);
    });
  });

  it("cleans a refused command without changing its fixed error", async () => {
    await fixture(async (directory) => {
      expect(
        await withSecretFile({ KEY: "secret" }, async () => err("command"), directory),
      ).toEqual(err("command"));
      expect(await readdir(directory)).toEqual([]);
    });
  });

  it("cleans and sanitizes thrown errors without exposing secret fragments", async () => {
    await fixture(async (directory) => {
      const result = await withSecretFile(
        { KEY: "private-fragment" },
        async () => {
          throw new Error("private-fragment command output");
        },
        directory,
      );
      expect(result).toEqual(err("secret-file-failed"));
      expect(await readdir(directory)).toEqual([]);
    });
  });

  it("does not run a command when private file creation fails", async () => {
    await fixture(async (directory) => {
      const file = pathModule.join(directory, "not-a-directory");
      await writeFile(file, "fixture");
      const calls: string[] = [];
      const result = await withSecretFile(
        { KEY: "secret" },
        async (path) => {
          calls.push(path);
          return ok(undefined);
        },
        file,
      );
      expect(result).toEqual(err("secret-file-failed"));
      expect(calls).toEqual([]);
    });
  });
});
