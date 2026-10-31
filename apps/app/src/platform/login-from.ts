import type { LoginDevice } from "@pace/client";

import { loadDeviceId } from "./device-id.ts";
import { phoneName } from "./phone-name.ts";

/** Where a bot login starts on this build: the phone app (the web build has `login-from.web.ts`). */
export const LOGIN_FROM = "app";

/**
The phone a bot login starts on, so the session it opens is named after it ("Pixel 9a") and
linked to this install's usage data.
*/
export const loginDevice = async (): Promise<LoginDevice | undefined> => ({
  deviceId: await loadDeviceId(),
  deviceName: phoneName(),
});
