import type { SessionKind } from "../shared/app-env.ts";
import type { NonceLogin } from "./nonce.ts";
import type { PhoneDetails } from "./sessions.ts";

import { clientName } from "./user-agent.ts";

/** An app that did not name its phone (one from before it could) is the Android app. */
const UNNAMED_APP = "Android";

/**
What a session opened by a bot login is: the app's, named by the phone it named, or the
browser's that asked for the nonce, named after that browser.
*/
export const nonceSession = (
  login: NonceLogin,
): {
  readonly kind: SessionKind;
  readonly name: string;
  readonly deviceId: null | string;
  readonly device?: PhoneDetails;
} =>
  login.from === "app"
    ? {
        device: { brand: login.deviceBrand, model: login.deviceModel, osVersion: login.osVersion },
        deviceId: login.deviceId,
        kind: "app",
        name: login.deviceName ?? UNNAMED_APP,
      }
    : { deviceId: null, kind: "browser", name: clientName(login.place.userAgent) };
