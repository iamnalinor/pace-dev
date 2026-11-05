/* eslint-disable security/detect-non-literal-fs-filename -- Paths name fixed installed public-certificate fixtures or isolated mkdtemp test fixtures; no external input is used. */
import type { ExpoConfig } from "expo/config";

import { createFingerprintAsync } from "expo/fingerprint";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { OTA_CERTIFICATE_PATH, otaBuildConfig } from "./ota-build-config.ts";

const certificateRoot = path.join(
  __dirname,
  "node_modules/expo-updates/android/src/shared/certificates",
);
const publicCertificate = readFileSync(path.join(certificateRoot, "test.pem"), "utf8");
const inputs = {
  publisherUrl: "https://publisher.example/manifest",
  channel: "preview",
  certificateFile: "./ota/publisher-certificate.pem",
  keyId: "root",
};
const fixture = { directory: "" };
beforeEach(() => {
  fixture.directory = mkdtempSync(path.join(tmpdir(), "pace-ota-trust-"));
  mkdirSync(path.join(fixture.directory, "ota"));
  writeFileSync(path.join(fixture.directory, "ota/publisher-certificate.pem"), publicCertificate);
});
afterEach(() => {
  rmSync(fixture.directory, { recursive: true, force: true });
});

it("keeps default builds disabled with no publisher inputs", () => {
  expect(otaBuildConfig({}, fixture.directory)).toEqual({ updates: { enabled: false } });
});
it("requires complete independent build trust and fingerprints signed builds", () => {
  expect(otaBuildConfig(inputs, fixture.directory)).toEqual({
    updates: {
      enabled: true,
      url: inputs.publisherUrl,
      requestHeaders: { "expo-channel-name": "preview" },
      codeSigningCertificate: OTA_CERTIFICATE_PATH,
      codeSigningMetadata: { alg: "rsa-v1_5-sha256", keyid: "root" },
      checkAutomatically: "NEVER",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: { policy: "fingerprint" },
  });
});
it.each([
  { publisherUrl: inputs.publisherUrl },
  { channel: "production" },
  { certificateFile: inputs.certificateFile },
  { keyId: "root" },
  { ...inputs, channel: "" },
  { ...inputs, publisherUrl: "" },
])("rejects partial or empty trust input %#", (input) => {
  expect(() => otaBuildConfig(input, fixture.directory)).toThrow("invalid-ota-build-config");
});
it.each([
  "http://publisher.example/manifest",
  "https://user:password@publisher.example/manifest",
  "https://publisher.example/manifest?channel=other",
  "https://publisher.example/manifest#fragment",
  "https://publisher.example/other",
  "https://PUBLISHER.example/manifest",
])("rejects unsafe publisher URL %s", (publisherUrl) => {
  expect(() => otaBuildConfig({ ...inputs, publisherUrl }, fixture.directory)).toThrow(
    "invalid-ota-build-config",
  );
});
it.each([
  { ...inputs, channel: "../other" },
  { ...inputs, keyId: 'root"header' },
  { ...inputs, certificateFile: path.join(tmpdir(), "foreign.pem") },
  { ...inputs, certificateFile: "./ota/../secret" },
])("rejects untrusted identifiers or certificate paths %#", (input) => {
  expect(() => otaBuildConfig(input, fixture.directory)).toThrow("invalid-ota-build-config");
});
it("rejects invalid/expired certificates and appended private material without echoing it", () => {
  for (const content of [
    "SECRET_INVALID_CERTIFICATE",
    `${publicCertificate}\n-----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY-----`,
    readFileSync(path.join(certificateRoot, "validityExpired.pem"), "utf8"),
  ]) {
    writeFileSync(path.join(fixture.directory, "ota/publisher-certificate.pem"), content);
    expect(() => otaBuildConfig(inputs, fixture.directory)).toThrow("invalid-ota-build-config");
    expect(() => otaBuildConfig(inputs, fixture.directory)).not.toThrow("SECRET");
  }
});
it("uses default root key ID and does not expose a selected server input", () => {
  const withoutKeyId = {
    publisherUrl: inputs.publisherUrl,
    channel: inputs.channel,
    certificateFile: inputs.certificateFile,
  };
  const config: Pick<ExpoConfig, "runtimeVersion" | "updates"> = otaBuildConfig(
    withoutKeyId,
    fixture.directory,
  );
  expect(config.updates?.codeSigningMetadata?.keyid).toBe("root");
  expect(config.updates?.url).toBe(inputs.publisherUrl);
});

it("fingerprints disabled builds without a publisher certificate", async () => {
  copyFileSync(
    path.join(__dirname, "fingerprint.config.js"),
    path.join(fixture.directory, "fingerprint.config.js"),
  );
  rmSync(path.join(fixture.directory, "ota/publisher-certificate.pem"));
  writeFileSync(path.join(fixture.directory, "package.json"), "{}");
  symlinkSync(
    path.join(__dirname, "node_modules"),
    path.join(fixture.directory, "node_modules"),
    "dir",
  );
  const fingerprint = await createFingerprintAsync(fixture.directory, {
    platforms: ["android"],
    useRNCoreAutolinkingFromExpo: true,
    silent: true,
  });
  expect(fingerprint.hash).toEqual(expect.any(String));
  expect(
    fingerprint.sources.some((source) => source.reasons.includes("otaCodeSigningCertificate")),
  ).toBe(false);
});

it("includes the stable public certificate bytes as an additive fingerprint source", async () => {
  copyFileSync(
    path.join(__dirname, "fingerprint.config.js"),
    path.join(fixture.directory, "fingerprint.config.js"),
  );
  writeFileSync(
    path.join(fixture.directory, "package.json"),
    JSON.stringify({ name: "ota-fingerprint-fixture", version: "1.0.0" }),
  );
  symlinkSync(
    path.join(__dirname, "node_modules"),
    path.join(fixture.directory, "node_modules"),
    "dir",
  );
  const fingerprintOptions = {
    platforms: ["android" as const],
    useRNCoreAutolinkingFromExpo: true,
    silent: true,
  };
  const before = await createFingerprintAsync(fixture.directory, fingerprintOptions);
  expect(
    before.sources.some(
      (source) =>
        source.type === "file" &&
        source.filePath === "ota/publisher-certificate.pem" &&
        source.hash !== null,
    ),
  ).toBe(true);
  writeFileSync(
    path.join(fixture.directory, "ota/publisher-certificate.pem"),
    readFileSync(path.join(certificateRoot, "chainRoot.pem")),
  );
  const after = await createFingerprintAsync(fixture.directory, fingerprintOptions);
  expect(after.hash).not.toBe(before.hash);
});

/* eslint-enable security/detect-non-literal-fs-filename -- end of isolated public-certificate fixture IO */
