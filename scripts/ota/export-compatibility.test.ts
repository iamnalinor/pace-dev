import { expect, test } from "bun:test";

import { parseExportMetadata } from "@pace/updates/export-metadata";

import metadata from "./fixtures/expo57-android-metadata.json";

test("accepts the real Expo 57 Android export including React Native XML assets", () => {
  const parsed = parseExportMetadata(metadata);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  expect(parsed.value.assets.filter((asset) => asset.ext === "xml")).toHaveLength(2);
  expect(
    parsed.value.assets
      .filter((asset) => asset.ext === "xml")
      .every((asset) => asset.contentType === "application/xml"),
  ).toBe(true);
});
