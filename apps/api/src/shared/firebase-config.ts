import type { MiddlewareHandler } from "hono";

import { HTTPException } from "hono/http-exception";

import {
  err,
  type FirebaseAndroidConfig,
  type FirebaseConfigError,
  FirebaseConfigPolicySchema,
  type FirebaseConfigReason,
  ok,
  type Result,
  validateFirebaseConfig,
} from "@pace/core";

import type { AppEnv } from "./app-env.ts";
import type { AppBindings } from "./ports/bindings.ts";

import { createLogger } from "./logger.ts";

const loggedReasons = new Set<FirebaseConfigError>();

/**
During the additive rollout, a sender alone is a valid legacy setup. Invalid pairs with Android
metadata get an operator diagnostic, while server discovery and legacy FCM still work as before.
*/
export const publicFirebaseConfigOf = (
  env: Pick<AppBindings, "FIREBASE_ANDROID_CONFIG" | "FIREBASE_SERVICE_ACCOUNT">,
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

/** The same policy verdict gates HTTP requests and sends from Durable Objects. */
export type FirebaseBindings = {
  readonly FIREBASE_ANDROID_CONFIG?: string | undefined;
  readonly FIREBASE_SERVICE_ACCOUNT?: string | undefined;
  readonly PACE_FIREBASE_CONFIG_POLICY?: string | undefined;
};

export const firebasePolicyVerdict = (
  env: FirebaseBindings,
): Result<null, FirebaseConfigReason> => {
  const parsed = FirebaseConfigPolicySchema.optional().safeParse(env.PACE_FIREBASE_CONFIG_POLICY);
  if (!parsed.success) {
    return err("invalid-config-policy");
  }
  const policy = parsed.data;
  if (policy === undefined || policy === "additive") {
    return ok(null);
  }
  const verdict = validateFirebaseConfig({
    FIREBASE_ANDROID_CONFIG: env.FIREBASE_ANDROID_CONFIG ?? "",
    FIREBASE_SERVICE_ACCOUNT: env.FIREBASE_SERVICE_ACCOUNT ?? "",
  });
  return verdict.ok ? ok(null) : verdict;
};

/** The shared policy applied before API authentication and protocol negotiation. */
export const refuseMisconfiguredFirebase: MiddlewareHandler<AppEnv> = async (c, next) => {
  const verdict = firebasePolicyVerdict(c.env);
  if (!verdict.ok) {
    const res = c.json(
      {
        code: "server/misconfigured",
        message: "Server configuration is invalid",
        reason: verdict.error,
      },
      500,
    );
    throw new HTTPException(500, { res });
  }
  await next();
};
