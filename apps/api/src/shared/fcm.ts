import { z } from "zod";

import { createLogger } from "./logger.ts";

/** The parts of a Firebase service account key (the JSON file) that sending needs. */
const ServiceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  private_key_id: z.string().optional(),
  token_uri: z.url().default("https://oauth2.googleapis.com/token"),
});

export type ServiceAccount = z.output<typeof ServiceAccountSchema>;

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** Where push messages go: the account that signs for them and the transport. */
export type FcmTarget = {
  readonly account: ServiceAccount;
  readonly fetch: Fetch;
  /** Which credentials these are (the account and its key's id): new ones are tried afresh. */
  readonly fingerprint: string;
};

/** What a push carries: string values only (FCM data messages). */
export type FcmMessage = {
  readonly token: string;
  readonly data: Readonly<Record<string, string>>;
  /** Messages with one key replace each other while waiting for the phone (the pool id). */
  readonly collapseKey: string;
};

/**
`sent`; `unregistered`: this device's token is gone (the app fetches a new one); `auth`: the
server's own credentials were refused (FCM is broken for everyone); `failed`: try another time.
*/
/**
`mismatch`: the token is another Firebase project's than the one the server sends with (the app
was built with another project's config): this device can never get FCM from this server.
*/
export type FcmOutcome = "auth" | "failed" | "mismatch" | "sent" | "unregistered";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Google's access tokens last an hour; one is reused while it has this long left. */
const REUSE_MARGIN_MS = 10 * 60_000;
const TOKEN_LIFETIME_S = 3600;

/** Access tokens per service account; a module-level cache lives as long as the isolate. */
const accessTokens = new Map<string, { readonly token: string; readonly expiresAt: number }>();
const warned = { missing: false };

/**
The push target the Worker's secret describes, or `null` when `FIREBASE_SERVICE_ACCOUNT` is
missing or unreadable (push is off; said once per isolate).
*/
export const fcmTargetOf = (
  env: { readonly FIREBASE_SERVICE_ACCOUNT?: string | undefined },
  fetcher: Fetch = async (input, init) => await fetch(input, init),
): FcmTarget | null => {
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  const parsed = (() => {
    try {
      return raw === undefined || raw === ""
        ? null
        : ServiceAccountSchema.safeParse(JSON.parse(raw));
    } catch {
      return null;
    }
  })();
  if (parsed?.success !== true) {
    if (!warned.missing) {
      warned.missing = true;
      createLogger("info").info("Push is off: FIREBASE_SERVICE_ACCOUNT is not set or not readable");
    }
    return null;
  }
  return {
    account: parsed.data,
    fetch: fetcher,
    fingerprint: `${parsed.data.client_email}#${parsed.data.private_key_id ?? ""}`,
  };
};

const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const textUrl = (text: string): string => base64Url(new TextEncoder().encode(text));

/** The PEM's base64 body as DER bytes. */
const pemBytes = (pem: string): Uint8Array =>
  Uint8Array.from(
    atob(pem.replaceAll(/-----[^-]+-----/gu, "").replaceAll(/\s+/gu, "")),
    (char) => char.codePointAt(0) ?? 0,
  );

/** A JWT signed RS256 with the service account's key: the OAuth2 grant assertion. */
const assertion = async (account: ServiceAccount, nowS: number): Promise<string> => {
  const header = textUrl(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = textUrl(
    JSON.stringify({
      aud: account.token_uri,
      exp: nowS + TOKEN_LIFETIME_S,
      iat: nowS,
      iss: account.client_email,
      scope: SCOPE,
    }),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(account.private_key).buffer as ArrayBuffer,
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
};

const signed = async (account: ServiceAccount, nowMs: number): Promise<null | string> => {
  try {
    return await assertion(account, Math.floor(nowMs / 1000));
  } catch {
    // A key that does not import or sign: the credentials themselves are broken.
    return null;
  }
};

/**
An access token for FCM, minted from the service account and reused for most of its hour;
`auth` when Google refuses the credentials, `failed` when it could not be asked.
*/
const accessToken = async (
  target: FcmTarget,
  nowMs: number,
): Promise<"auth" | "failed" | { readonly token: string }> => {
  const cached = accessTokens.get(target.fingerprint);
  if (cached !== undefined && cached.expiresAt - nowMs > REUSE_MARGIN_MS) {
    return { token: cached.token };
  }
  const jwt = await signed(target.account, nowMs);
  if (jwt === null) {
    return "auth";
  }
  const response = await target.fetch(target.account.token_uri, {
    body: new URLSearchParams({
      assertion: jwt,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) {
    // 400 invalid_grant / 401: the key was revoked or the account deleted.
    return response.status === 400 || response.status === 401 ? "auth" : "failed";
  }
  const body = await response.json<{ access_token?: unknown; expires_in?: unknown }>();
  if (typeof body.access_token !== "string") {
    return "failed";
  }
  const lifetime = typeof body.expires_in === "number" ? body.expires_in : TOKEN_LIFETIME_S;
  accessTokens.set(target.fingerprint, {
    expiresAt: nowMs + lifetime * 1000,
    token: body.access_token,
  });
  return { token: body.access_token };
};

const FieldViolationSchema = z.object({ field: z.string().optional() });

const ErrorDetailSchema = z.object({
  errorCode: z.string().optional(),
  fieldViolations: z.array(FieldViolationSchema).optional(),
});

/** What FCM's error body says: its `FcmError` code and the request fields it names. */
const FcmErrorSchema = z.object({
  error: z.object({
    status: z.string().optional(),
    details: z.array(ErrorDetailSchema).optional(),
  }),
});

type ErrorDetail = z.output<typeof ErrorDetailSchema>;

/** The error's codes and details; nothing when the body is not FCM's error. */
const errorOf = async (
  response: Response,
): Promise<{ readonly codes: ReadonlySet<string>; readonly details: readonly ErrorDetail[] }> => {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: the status alone decides.
  }
  const parsed = FcmErrorSchema.safeParse(body);
  if (!parsed.success) {
    return { codes: new Set(), details: [] };
  }
  const { details = [], status } = parsed.data.error;
  const codes = details.flatMap((detail) => detail.errorCode ?? []);
  return { codes: new Set(status === undefined ? codes : [status, ...codes]), details };
};

const isAboutToken = (detail: ErrorDetail): boolean =>
  (detail.fieldViolations ?? []).some((violation) => violation.field === "message.token");

/**
What a refused send means. The body decides first: a token another project issued
(`SENDER_ID_MISMATCH`, a 403) is this device's FCM never working with this server (it polls);
one FCM no longer knows (`UNREGISTERED`) or a malformed token (`INVALID_ARGUMENT` naming
`message.token`) is this device gone; any other `INVALID_ARGUMENT` is the message, tried again
another time. Then the status: 401 is the access token (`stale`: mint a
fresh one and retry once), 403 the project refusing the account (FCM broken for everyone). A 404
without `UNREGISTERED` is a project or address FCM does not know, not this device: a failure.
*/
const refusalOf = async (response: Response): Promise<"stale" | Exclude<FcmOutcome, "sent">> => {
  const { codes, details } = await errorOf(response);
  const isTokenRefused =
    codes.has("INVALID_ARGUMENT") && details.some((detail) => isAboutToken(detail));
  if (codes.has("SENDER_ID_MISMATCH")) {
    return "mismatch";
  }
  if (isTokenRefused || codes.has("UNREGISTERED")) {
    return "unregistered";
  }
  switch (response.status) {
    case 401: {
      return "stale";
    }
    case 403: {
      return "auth";
    }
    default: {
      return "failed";
    }
  }
};

const postMessage = async (
  target: FcmTarget,
  message: FcmMessage,
  nowMs: number,
): Promise<"stale" | FcmOutcome> => {
  const access = await accessToken(target, nowMs);
  if (typeof access === "string") {
    return access;
  }
  const response = await target.fetch(
    `https://fcm.googleapis.com/v1/projects/${target.account.project_id}/messages:send`,
    {
      body: JSON.stringify({
        message: {
          android: { collapse_key: message.collapseKey, priority: "high" },
          data: message.data,
          token: message.token,
        },
      }),
      headers: { Authorization: `Bearer ${access.token}`, "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (response.ok) {
    return "sent";
  }
  const refusal = await refusalOf(response);
  if (refusal === "stale" || refusal === "auth") {
    accessTokens.delete(target.fingerprint);
  }
  return refusal;
};

/**
Sends one data message through FCM HTTP v1, high priority so Android wakes the app for it. An
access token FCM no longer takes is replaced once; refused again, the credentials are (`auth`).
A failure never throws: the other channels carry on.
*/
export const sendFcm = async (target: FcmTarget, message: FcmMessage): Promise<FcmOutcome> => {
  try {
    const first = await postMessage(target, message, Date.now());
    if (first !== "stale") {
      return first;
    }
    const retried = await postMessage(target, message, Date.now());
    return retried === "stale" ? "auth" : retried;
  } catch {
    return "failed";
  }
};
