import type { FirebaseConfigReason, MessageKey } from "@pace/core";

const REASON_KEY: Readonly<Record<FirebaseConfigReason, MessageKey>> = {
  "android-config-invalid": "server.firebaseAndroidInvalid",
  "android-config-not-json": "server.firebaseAndroidNotJson",
  "duplicate-android-package": "server.firebaseDuplicatePackage",
  "invalid-config-policy": "server.firebasePolicyInvalid",
  "invalid-service-account": "server.firebaseAccountInvalid",
  "missing-android-config": "server.firebaseAndroidMissing",
  "missing-service-account": "server.firebaseAccountMissing",
  "no-android-clients": "server.firebaseNoAndroid",
  "project-mismatch": "server.firebaseProjectMismatch",
};

/** Only known reason codes select copy; server-provided text is never displayed. */
export const configurationErrorKey = (reason: FirebaseConfigReason | null): MessageKey =>
  reason === null ? "server.misconfigured" : REASON_KEY[reason];
