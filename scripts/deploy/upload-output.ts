import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

const isExactHttpsOrigin = (input: string): boolean => {
  try {
    const url = new URL(input);
    return url.protocol === "https:" && input === url.origin;
  } catch {
    return false;
  }
};

const uploadRecord = z.object({
  type: z.literal("version-upload"),
  version: z.literal(1),
  worker_name: z.string().min(1),
  version_id: z.uuid(),
  preview_url: z.string().refine(isExactHttpsOrigin),
});
const outputRecord = z.looseObject({ type: z.string() });
type UploadedVersion = { readonly versionId: string; readonly previewUrl: string };

/**
Parse the pinned Wrangler structured output file, never human-readable stdout. This proves
only the command's reported identity; control-plane drift checks and the trusted-origin
probe adapter must still establish inactivity, ownership and effective configuration.
*/
export const parseUploadOutput = (
  output: string,
  expectedWorker: string,
): Result<UploadedVersion, "malformed"> => {
  try {
    const records = output
      .trim()
      .split("\n")
      .map((line) => outputRecord.parse(JSON.parse(line) as unknown));
    const uploads = records.filter((record) => record.type === "version-upload");
    if (uploads.length !== 1) {
      return err("malformed");
    }
    const parsed = uploadRecord.safeParse(uploads[0]);
    return parsed.success && parsed.data.worker_name === expectedWorker
      ? ok({ versionId: parsed.data.version_id, previewUrl: parsed.data.preview_url })
      : err("malformed");
  } catch {
    return err("malformed");
  }
};
