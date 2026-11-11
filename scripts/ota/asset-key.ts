import { createHash } from "node:crypto";

/** Expo's compatibility/cache identifier. SHA-256 separately authenticates the asset bytes. */
export const expoAssetKey = (bytes: string | Uint8Array): string => {
  // eslint-disable-next-line sonarjs/hashing -- Expo compatibility identifier only; signed SHA-256 hashes provide integrity.
  return createHash("md5").update(bytes).digest("hex");
};
