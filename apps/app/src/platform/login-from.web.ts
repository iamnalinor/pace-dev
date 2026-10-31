import type { LoginDevice } from "@pace/client";

/** Where a bot login starts on this build: the browser, so the bot's button leads back to the site. */
export const LOGIN_FROM = "web";

/** A browser names no device: the server names its session after the User-Agent. */
export const loginDevice = async (): Promise<LoginDevice | undefined> => {
  await Promise.resolve();
  return undefined;
};
