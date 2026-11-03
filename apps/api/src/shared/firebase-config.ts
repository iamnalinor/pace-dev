import {
  type FirebaseAndroidConfig,
  type FirebaseConfigError,
  validateFirebaseConfig,
} from "@pace/core";

import { createLogger } from "./logger.ts";

const loggedReasons = new Set<FirebaseConfigError>();

/**
During the additive rollout, a sender alone is a valid legacy setup. Invalid pairs with Android
metadata get an operator diagnostic, while server discovery and legacy FCM still work as before.
*/
export const publicFirebaseConfigOf = (
  env: Pick<Cloudflare.Env, "FIREBASE_ANDROID_CONFIG" | "FIREBASE_SERVICE_ACCOUNT">,
): FirebaseAndroidConfig | null => {
  if (env.FIREBASE_ANDROID_CONFIG === undefined || env.FIREBASE_ANDROID_CONFIG === "") {
    return null;
  }
  const config = validateFirebaseConfig(env);
  if (config.ok) {
    return config.value;
  }
  if (!loggedReasons.has(config.error)) {
    loggedReasons.add(config.error);
    createLogger("info").warn("Firebase Android metadata is unavailable", { reason: config.error });
  }
  return null;
};
