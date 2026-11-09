import { DEVICE_FIELD_LIMITS, endpoints, sliceWhole } from "@pace/core";

import { type ApiClient, ApiError } from "./api-client.ts";

/** The phone a bot login starts on: its model and its install id. */
export type LoginDevice = {
  readonly deviceName?: string;
  readonly deviceId?: string;
  readonly deviceBrand?: string;
  readonly deviceModel?: string;
  readonly osVersion?: string;
};

const DEVICE_TEXT_FIELDS = ["deviceName", "deviceBrand", "deviceModel", "osVersion"] as const;
const DEVICE_ID_MAX = 64;
/** The fields an older Worker's strict body already knows. */
const OLD_SERVER_FIELDS = ["deviceId", "deviceName"] as const;

/**
What a login may carry about the phone: each text trimmed and cut to the schema's limit (a long
custom-ROM model must not lose its field), blank ones left out. The server's `.max()` counts UTF-16
units, so the cut does too, between two characters (`sliceWhole`): a cut by grapheme left an emoji
model over the limit, and the server drops a field that does not fit (bug-lessons 186).
*/
export const cleanLoginDevice = (device: LoginDevice | undefined): LoginDevice | undefined => {
  if (device === undefined) {
    return undefined;
  }
  const clean: Record<string, string> = {};
  for (const key of DEVICE_TEXT_FIELDS) {
    const text = device[key]?.trim() ?? "";
    if (text !== "") {
      clean[key] = sliceWhole(text, DEVICE_FIELD_LIMITS[key]).trimEnd();
    }
  }
  const id = device.deviceId?.trim() ?? "";
  if (id !== "" && id.length <= DEVICE_ID_MAX) {
    clean["deviceId"] = id;
  }
  return clean;
};

/**
Asks for a nonce. A Worker from before the phone's maker/model/version fields refuses a body with
keys it does not know (422): the same request goes again with only what that Worker knows, so a
newer app signs in against an older server.
*/
export const createNonce = async (
  api: ApiClient,
  from: "app" | "web",
  body: LoginDevice | undefined,
): Promise<{ readonly deepLink: string; readonly nonce: string }> => {
  try {
    return await api.call(endpoints.auth.nonceCreate, { body, query: { from } });
  } catch (error) {
    const isExtra = Object.keys(body ?? {}).some(
      (key) => !(OLD_SERVER_FIELDS as readonly string[]).includes(key),
    );
    if (!isExtra || !(error instanceof ApiError) || error.status !== 422) {
      throw error;
    }
    const old = Object.fromEntries(
      Object.entries(body ?? {}).filter(([key]) =>
        (OLD_SERVER_FIELDS as readonly string[]).includes(key),
      ),
    );
    return await api.call(endpoints.auth.nonceCreate, { body: old, query: { from } });
  }
};
