import { endpoints, err, ok, type Result, type User, UserSchema } from "@pace/core";

import { type ApiClient, ApiError } from "./api-client.ts";
import { type Session, SESSION_CHANGED } from "./auth-session.ts";

/**
Fetches the signed-in user. A 401 signs out as "ended elsewhere", but only for the token the
request carried and only while it is still the one in use: a 401 for a token this device has
forgotten or replaced meanwhile (it ended its own session) says nothing about the session in use
(fix round 1).
*/
const shouldForgetMe = (
  session: Session,
  error: unknown,
  sent: { readonly token: string | undefined; readonly owner: number },
): boolean =>
  sent.token !== undefined &&
  error instanceof ApiError &&
  error.status === 401 &&
  session.token() === sent.token &&
  session.owns(sent.owner) &&
  session.ending() !== sent.token;

const recoverMe = async (
  session: Session,
  error: unknown,
  sent: {
    readonly token: string | undefined;
    readonly owner: number;
    readonly isAdopting: boolean;
  },
): Promise<Result<User, string>> => {
  if (!session.owns(sent.owner)) {
    return err(SESSION_CHANGED);
  }
  if (!sent.isAdopting && sent.token !== undefined && shouldForgetMe(session, error, sent)) {
    await session.signOut(
      (await session.isLoggedOutInAnotherTab(sent.token))
        ? { endedInAnotherTab: true }
        : { endedElsewhere: true },
      sent.owner,
    );
  }
  return err(error instanceof ApiError ? error.code : "network");
};

export const meOf =
  (
    api: ApiClient,
    session: Session,
    isAdopting = false,
  ): ((signal?: AbortSignal) => Promise<Result<User, string>>) =>
  async (signal?: AbortSignal): Promise<Result<User, string>> => {
    const owner = session.owner();
    if (!session.owns(owner)) {
      return err(SESSION_CHANGED);
    }
    const sent = session.token();
    try {
      // The answer carries the store id too; the sync confirms that on its own pulls.
      const user = UserSchema.parse(
        await api.call(endpoints.me, {}, signal === undefined ? {} : { signal }),
      );
      // An answer for a token this device dropped or replaced meanwhile (a Log out while the check
      // was on its way) writes nothing: it would sign a wiped device back in (fix round 1 of QA 22).
      if (!session.owns(owner) || session.token() !== sent) {
        return err(SESSION_CHANGED);
      }
      session.store.setState({ status: "signed-in", user });
      return ok(user);
    } catch (error) {
      return await recoverMe(session, error, { token: sent, owner, isAdopting });
    }
  };
