import { expect, it } from "bun:test";

import { parseUploadOutput } from "./upload-output.ts";

const record = {
  type: "version-upload",
  version: 1,
  worker_name: "pace-candidate",
  version_id: "11111111-1111-4111-8111-111111111111",
  preview_url: "https://exact-preview.example",
  preview_alias_url: "https://moving-alias.example",
};
const parse = (value: unknown) => parseUploadOutput(JSON.stringify(value), "pace-candidate");

it("reads the exact version URL rather than a moving alias from pinned Wrangler output", () => {
  expect(parse(record)).toEqual({
    ok: true,
    value: {
      versionId: record.version_id,
      previewUrl: record.preview_url,
    },
  });
});
it("permits unrelated structured session records without interpreting stdout", () => {
  const output = [
    JSON.stringify({ type: "wrangler-session", version: 1 }),
    JSON.stringify(record),
  ].join("\n");
  expect(parseUploadOutput(output, "pace-candidate").ok).toBe(true);
});
it.each([
  { ...record, worker_name: "other-worker" },
  { ...record, version: 2 },
  { ...record, version_id: "" },
  { ...record, preview_url: null },
  { ...record, preview_url: "http://exact-preview.example" },
  { ...record, preview_url: "https://user:password@exact-preview.example" },
  { ...record, preview_url: "https://exact-preview.example?redirect=foreign" },
])("rejects incomplete or mismatched upload records", (value) => {
  expect(parse(value).ok).toBe(false);
});
it("refuses duplicate records and partial/malformed output", () => {
  expect(
    parseUploadOutput(`${JSON.stringify(record)}\n${JSON.stringify(record)}`, "pace-candidate").ok,
  ).toBe(false);
  expect(parseUploadOutput(`${JSON.stringify(record)}\n{`, "pace-candidate").ok).toBe(false);
  expect(parseUploadOutput("Uploaded worker successfully", "pace-candidate").ok).toBe(false);
  expect(parseUploadOutput("", "pace-candidate").ok).toBe(false);
});
