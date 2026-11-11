import { constants, createPrivateKey, sign } from "node:crypto";

import type { OtaError, SignedManifest } from "@pace/updates/types";

import { err, ok, type Result } from "@pace/core";
import { validateManifestBytes } from "@pace/updates/manifest";

type Signing = { readonly privateKeyPem: string; readonly keyId: string };
export type { SignedManifest } from "@pace/updates/types";
export const signManifest = (
  bytes: Uint8Array,
  signing: Signing,
): Result<SignedManifest, OtaError> => {
  if (!/^[\w.-]{1,128}$/.test(signing.keyId) || !validateManifestBytes(bytes).ok) {
    return err("signing-failed");
  }
  try {
    const key = createPrivateKey(signing.privateKeyPem);
    if (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
      return err("signing-failed");
    }
    const body = Uint8Array.from(bytes);
    const signature = sign("sha256", body, { key, padding: constants.RSA_PKCS1_PADDING }).toString(
      "base64",
    );
    return ok({
      body,
      signature,
      signatureHeader: `sig="${signature}", keyid="${signing.keyId}", alg="rsa-v1_5-sha256"`,
    });
  } catch {
    return err("signing-failed");
  }
};
