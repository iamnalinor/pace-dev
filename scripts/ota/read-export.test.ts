import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createManifest } from "@pace/updates/manifest";

import { readExport } from "./read-export.ts";

const metadata = {
  version: 0,
  bundler: "metro",
  fileMetadata: { android: { bundle: "entry.hbc", assets: [{ path: "assets/font", ext: "ttf" }] } },
};
const withExport = async (run: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(path.join(tmpdir(), "pace-ota-export-"));
  try {
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "metadata.json"), JSON.stringify(metadata));
    await writeFile(path.join(root, "entry.hbc"), "hermes");
    await writeFile(path.join(root, "assets/font"), "font");
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

describe("safe export artifact reading", () => {
  test("reads actual file bytes and computes independent protocol hashes", async () => {
    await withExport(async (root) => {
      const result = await readExport(root);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.value.files).toHaveLength(2);
      const launch = result.value.files.find((entry) => entry.path === "entry.hbc");
      expect(launch).toMatchObject({ size: 6 });
      expect(new TextDecoder().decode(launch?.bytes)).toBe("hermes");
      expect(
        createManifest(
          {
            id: "12345678-1234-4234-8234-123456789abc",
            createdAt: "2026-11-05T12:00:00.000Z",
            runtimeVersion: "runtime",
            assetOrigin: "https://updates.example",
          },
          result.value,
        ).ok,
      ).toBe(true);
    });
  });
  test("missing assets and directory assets fail with fixed errors", async () => {
    await withExport(async (root) => {
      await rm(path.join(root, "assets/font"));
      expect(await readExport(root)).toEqual({ ok: false, error: "export-read-failed" });
      await mkdir(path.join(root, "assets/font"));
      expect((await readExport(root)).ok).toBe(false);
    });
  });
  test("refuses file and ancestor symlink escape outside the export root", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "pace-ota-outside-"));
    try {
      await writeFile(path.join(outside, "font"), "private-secret");
      await withExport(async (root) => {
        await rm(path.join(root, "assets/font"));
        await symlink(path.join(outside, "font"), path.join(root, "assets/font"));
        expect(await readExport(root)).toEqual({ ok: false, error: "unsafe-export-path" });
      });
      await withExport(async (root) => {
        await rm(path.join(root, "assets"), { recursive: true });
        await symlink(outside, path.join(root, "assets"));
        expect(await readExport(root)).toEqual({ ok: false, error: "unsafe-export-path" });
      });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
  test("refuses escaped metadata and never echoes file contents or paths", async () => {
    await withExport(async (root) => {
      await writeFile(path.join(root, "metadata.json"), "SECRET_INVALID_JSON");
      const result = await readExport(root);
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain("SECRET");
      expect(JSON.stringify(result)).not.toContain(root);
    });
  });
});
