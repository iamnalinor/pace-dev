import type { ExpoConfig } from "expo/config";

import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const OTA_CERTIFICATE_PATH = "./ota/publisher-certificate.pem";
export type OtaBuildInputs = {
  readonly publisherUrl?: string | undefined;
  readonly channel?: string | undefined;
  readonly certificateFile?: string | undefined;
  readonly keyId?: string | undefined;
};
type OtaConfig = Pick<ExpoConfig, "runtimeVersion" | "updates">;
const isPublisherUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      url.href === value &&
      url.protocol === "https:" &&
      url.pathname === "/manifest" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
};
const isCertificatePem = (value: string): boolean => {
  const pem = value.trim();
  return (
    pem.startsWith("-----BEGIN CERTIFICATE-----") &&
    pem.endsWith("-----END CERTIFICATE-----") &&
    pem.split("-----BEGIN CERTIFICATE-----").length === 2 &&
    pem.split("-----END CERTIFICATE-----").length === 2
  );
};
// Node returns undefined when EKU is absent, despite @types/node declaring string[].
const hasAllowedCertificateUsages = (value: unknown): boolean =>
  value === undefined || (Array.isArray(value) && value.includes("1.3.6.1.5.5.7.3.3"));
const isValidCertificate = (pem: string): boolean => {
  if (!isCertificatePem(pem)) {
    return false;
  }
  const certificate = new X509Certificate(pem);
  const key = certificate.publicKey;
  const now = Date.now();
  const usages = certificate.keyUsage;
  return (
    key.asymmetricKeyType === "rsa" &&
    (key.asymmetricKeyDetails?.modulusLength ?? 0) >= 2048 &&
    Date.parse(certificate.validFrom) <= now &&
    Date.parse(certificate.validTo) > now &&
    hasAllowedCertificateUsages(usages)
  );
};
const configured = (input: OtaBuildInputs, projectRoot: string): OtaConfig => {
  const { publisherUrl, channel, certificateFile } = input;
  const keyId = input.keyId ?? "root";
  if (
    publisherUrl === undefined ||
    channel === undefined ||
    certificateFile !== OTA_CERTIFICATE_PATH ||
    !isPublisherUrl(publisherUrl) ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(channel) ||
    !/^[\w.-]{1,128}$/.test(keyId)
  ) {
    throw new Error("invalid-ota-build-config");
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- The fixed public certificate path is validated above, relative to the build-owned project root.
  const certificate = readFileSync(path.join(projectRoot, "ota/publisher-certificate.pem"), "utf8");
  if (!isValidCertificate(certificate)) {
    throw new Error("invalid-ota-build-config");
  }
  return {
    updates: {
      enabled: true,
      url: publisherUrl,
      requestHeaders: { "expo-channel-name": channel },
      codeSigningCertificate: OTA_CERTIFICATE_PATH,
      codeSigningMetadata: { alg: "rsa-v1_5-sha256", keyid: keyId },
      // JS owns the hourly/Wi-Fi download policy. NEVER also disables native recovery fetching.
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: { policy: "fingerprint" },
  };
};
/** Build-only publisher trust: selected account/server values never enter this boundary. */
export const otaBuildConfig = (input: OtaBuildInputs, projectRoot: string): OtaConfig => {
  if (Object.values(input).every((value) => value === undefined)) {
    return { updates: { enabled: false } };
  }
  try {
    return configured(input, projectRoot);
  } catch {
    throw new Error("invalid-ota-build-config");
  }
};
