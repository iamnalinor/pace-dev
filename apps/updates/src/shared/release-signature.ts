import { err, ok, type Result } from "@pace/core";

import type { SignedManifest } from "./types.ts";

/**
Checks the manifest's exact bytes against the publisher's pinned key: the SubjectPublicKeyInfo
(DER) of the code-signing certificate the app embeds, so a release the app would refuse is never
staged or promoted. RSASSA-PKCS1-v1_5 with SHA-256, as Expo signs (`alg="rsa-v1_5-sha256"`).
*/
export const verifyReleaseSignature = async (
  signed: SignedManifest,
  publisherKey: Uint8Array,
): Promise<Result<void, "signature-invalid">> => {
  try {
    const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const key = await crypto.subtle.importKey(
      "spki",
      Uint8Array.from(publisherKey),
      algorithm,
      false,
      ["verify"],
    );
    const signature = Uint8Array.from(atob(signed.signature), (char) => char.codePointAt(0) ?? 0);
    const isValid = await crypto.subtle.verify(
      algorithm,
      key,
      signature,
      Uint8Array.from(signed.body),
    );
    return isValid ? ok(undefined) : err("signature-invalid");
  } catch {
    return err("signature-invalid");
  }
};
