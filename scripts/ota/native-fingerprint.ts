import { z } from "zod";

import { err, ok, type Result } from "@pace/core";

const hashSchema = z.string().regex(/^[a-f0-9]{40}$/);
const sourceSchema = z.object({
  type: z.enum(["file", "dir", "contents"]),
  id: z.string().optional(),
  filePath: z.string().optional(),
  hash: z.string().nullable().optional(),
});
const fingerprintSchema = z.object({ hash: hashSchema, sources: z.array(sourceSchema) });
type Source = z.output<typeof sourceSchema>;
export type NativeFingerprintError = "fingerprint-incomplete" | "fingerprint-unavailable";

const hasNativeSources = (sources: readonly Source[]): boolean =>
  sources.some((source) => source.type === "contents" && source.id === "expoConfig") &&
  sources.some(
    (source) => source.type === "dir" && source.filePath === "modules/pace-native/android",
  ) &&
  sources.some(
    (source) => source.type === "contents" && source.id === "expoAutolinkingConfig:android",
  ) &&
  sources.some(
    (source) => source.type === "contents" && source.id === "rncoreAutolinkingConfig:android",
  );

/** Missing subprocess output can yield a valid hash over a partial source set. Never publish it. */
export const validateNativeFingerprint = (
  input: unknown,
  requiresCertificate: boolean,
): Result<string, NativeFingerprintError> => {
  const parsed = fingerprintSchema.safeParse(input);
  if (!parsed.success) {
    return err("fingerprint-unavailable");
  }
  const sources = parsed.data.sources.filter((source) => hashSchema.safeParse(source.hash).success);
  const hasCertificate = sources.some(
    (source) => source.type === "file" && source.filePath === "ota/publisher-certificate.pem",
  );
  return !hasNativeSources(sources) || (requiresCertificate && !hasCertificate)
    ? err("fingerprint-incomplete")
    : ok(parsed.data.hash);
};
