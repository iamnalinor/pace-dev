/** Where a bot login started: the Android app or a browser. */
export type LoginFrom = "app" | "web";

/** The `/start` payload's prefix per origin (Telegram allows [A-Za-z0-9_-], 64 chars). */
const PREFIX: Readonly<Record<LoginFrom, string>> = { app: "login_", web: "weblogin_" };

/** The bot deep link's payload: where the login started, then the nonce. */
export const loginPayload = (nonce: string, from: LoginFrom): string => `${PREFIX[from]}${nonce}`;

/** The nonce and origin of a `/start` payload; undefined when it is no login. */
export const readLoginPayload = (
  payload: string,
): undefined | { readonly nonce: string; readonly from: LoginFrom } => {
  if (payload.startsWith(PREFIX.web)) {
    return { from: "web", nonce: payload.slice(PREFIX.web.length) };
  }
  return payload.startsWith(PREFIX.app)
    ? { from: "app", nonce: payload.slice(PREFIX.app.length) }
    : undefined;
};

/** Hosts of a local web origin (a dev Worker): Telegram refuses buttons leading there. */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost"]);

/**
Where "Return to Pace" leads: back into the app through its App Link (`/app/*` opens Pace on
Android, else a page with a button that does), or the website a browser login came from;
undefined (no button) for a local origin, whose button would fail the whole reply.
*/
export const returnUrl = (webOrigin: string, from: LoginFrom): string | undefined => {
  if (LOCAL_HOSTS.has(new URL(webOrigin).hostname)) {
    return undefined;
  }
  return from === "app" ? `${webOrigin}/app/login` : `${webOrigin}/`;
};
