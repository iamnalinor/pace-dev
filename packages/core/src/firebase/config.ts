import { z } from "zod";

import { err, ok, type Result } from "../result.ts";

const isNonBlank = (value: string): boolean => value.trim() !== "";
const NonBlank = z.string().refine(isNonBlank);

const AndroidAppSchema = z.object({
  apiKey: NonBlank,
  appId: NonBlank,
  packageName: NonBlank,
});

const hasUniquePackages = (apps: readonly z.output<typeof AndroidAppSchema>[]): boolean =>
  new Set(apps.map(({ packageName }) => packageName)).size === apps.length;

/** The public subset of google-services.json that Android builds need to initialize Firebase. */
export const FirebaseAndroidConfigSchema = z.object({
  apps: z.array(AndroidAppSchema).min(1).refine(hasUniquePackages),
  projectId: NonBlank,
  senderId: NonBlank,
});

export type FirebaseAndroidConfig = z.output<typeof FirebaseAndroidConfigSchema>;

export type FirebaseConfigError =
  | "android-config-invalid"
  | "android-config-not-json"
  | "duplicate-android-package"
  | "invalid-service-account"
  | "missing-android-config"
  | "missing-service-account"
  | "no-android-clients"
  | "project-mismatch";

const OptionalUnknown = z.unknown().optional();
const GoogleClientInfoSchema = z.object({
  android_client_info: OptionalUnknown,
  mobilesdk_app_id: OptionalUnknown,
});
const GoogleClientSchema = z.object({
  api_key: OptionalUnknown,
  client_info: GoogleClientInfoSchema.optional(),
});
const GoogleServicesSchema = z.object({
  client: z.array(GoogleClientSchema).default([]),
  project_info: z.object({ project_id: NonBlank, project_number: NonBlank }),
});

const GoogleApiKeysSchema = z.tuple([z.object({ current_key: NonBlank })], z.unknown());
const GoogleAndroidClientInfoSchema = z.object({
  android_client_info: z.object({ package_name: NonBlank }),
  mobilesdk_app_id: NonBlank,
});
const GoogleAndroidClientsSchema = z.array(
  z.object({
    api_key: GoogleApiKeysSchema,
    client_info: GoogleAndroidClientInfoSchema,
  }),
);

/** JSON never yields `undefined`, so it can distinguish a syntax error from a wrong shape. */
const jsonOf = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
};

export const parseFirebaseAndroidConfig = (
  raw: string,
): Result<FirebaseAndroidConfig, FirebaseConfigError> => {
  const json = jsonOf(raw);
  if (json === undefined) {
    return err("android-config-not-json");
  }
  const parsed = GoogleServicesSchema.safeParse(json);
  if (!parsed.success) {
    return err("android-config-invalid");
  }
  const { client, project_info: project } = parsed.data;
  const android = client.filter(
    ({ client_info }) => client_info?.android_client_info !== undefined,
  );
  if (android.length === 0) {
    return err("no-android-clients");
  }
  const clients = GoogleAndroidClientsSchema.safeParse(android);
  if (!clients.success) {
    return err("android-config-invalid");
  }
  const apps = clients.data.map(({ api_key: keys, client_info: info }) => ({
    apiKey: keys[0].current_key,
    appId: info.mobilesdk_app_id,
    packageName: info.android_client_info.package_name,
  }));
  return hasUniquePackages(apps)
    ? ok({ apps, projectId: project.project_id, senderId: project.project_number })
    : err("duplicate-android-package");
};

/** The service-account shape the existing FCM sender accepts. */
const FirebaseServiceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  private_key_id: z.string().optional(),
  token_uri: z.url().default("https://oauth2.googleapis.com/token"),
});

export type FirebaseServiceAccount = z.output<typeof FirebaseServiceAccountSchema>;

/** Reads the sender's credentials without changing which legacy credentials it accepts. */
export const parseFirebaseServiceAccount = (
  raw: string,
): Result<FirebaseServiceAccount, "invalid-service-account"> => {
  const parsed = FirebaseServiceAccountSchema.safeParse(jsonOf(raw));
  return parsed.success ? ok(parsed.data) : err("invalid-service-account");
};

const hasNonBlankAccountFields = (account: FirebaseServiceAccount): boolean =>
  [account.project_id, account.client_email, account.private_key].every((value) =>
    isNonBlank(value),
  );

/** Strict pair validation for rollout. The additive API still permits a legacy sender alone. */
export const validateFirebaseConfig = ({
  FIREBASE_ANDROID_CONFIG: android,
  FIREBASE_SERVICE_ACCOUNT: service,
}: {
  readonly FIREBASE_ANDROID_CONFIG?: string;
  readonly FIREBASE_SERVICE_ACCOUNT?: string;
}): Result<FirebaseAndroidConfig | null, FirebaseConfigError> => {
  const hasAndroid = android !== undefined && android !== "";
  const hasService = service !== undefined && service !== "";
  if (!hasAndroid) {
    return hasService ? err("missing-android-config") : ok(null);
  }
  if (!hasService) {
    return err("missing-service-account");
  }
  const config = parseFirebaseAndroidConfig(android);
  if (!config.ok) {
    return config;
  }
  const account = parseFirebaseServiceAccount(service);
  if (!account.ok || !hasNonBlankAccountFields(account.value)) {
    return err("invalid-service-account");
  }
  return account.value.project_id === config.value.projectId ? config : err("project-mismatch");
};
