import { createStore, type StoreApi } from "zustand/vanilla";

import type { User } from "@pace/core";

import { noteMark, type SessionStore, type SignOutNotes, tryStore } from "./session.ts";

export type AuthState = {
  readonly status: "loading" | "signed-in" | "signed-out";
  /** Known after a login or `me()`; `null` right after startup with a stored token. */
  readonly user: null | User;
  /**
  Signed out because the server no longer knew the session (ended on another device, or
  expired): the login card says so. Absent otherwise; a new session clears it.
  */
  readonly endedElsewhere?: true | undefined;
  /**
  Signed out because another tab of this browser logged out: the login card says that instead
  (QA round 18 L3). Only on that tab's word (a note it leaves before its log-out goes out), never
  inferred from a store found empty (fix round 5 V1). Absent otherwise.
  */
  readonly endedInAnotherTab?: true | undefined;
};

export type Granted = { readonly token: string; readonly user: User };

type SignOutReason = { readonly endedElsewhere: true } | { readonly endedInAnotherTab: true };

export type Session = {
  readonly ready: Promise<void>;
  readonly store: StoreApi<AuthState>;
  readonly token: () => string | undefined;
  /** Whether this session ended (signed out, for any reason) and no new one began. */
  readonly hasEnded: () => boolean;
  readonly signIn: (granted: Granted) => Promise<User>;
  /**
  Why, when the person did not sign out here: the server no longer knew the session
  (`endedElsewhere`), or another tab of this browser signed out (`endedInAnotherTab`).
  */
  readonly signOut: (reason?: SignOutReason) => Promise<void>;
  /**
  Whether another tab of this browser logged `token` out (it left its note first); false when
  there is no word of it, or no way to read one.
  */
  readonly isLoggedOutInAnotherTab: (token: string) => Promise<boolean>;
  /** Leaves that note for `token` before this tab logs it out; nothing when it cannot. */
  readonly leaveNote: (token: string) => Promise<void>;
  /** Takes back the note for `token` (its end failed), unless a newer note replaced it. */
  readonly withdrawNote: (token: string) => Promise<void>;
  /** The session this tab is ending itself, if any: a 401 for it is no news (round 6 M1). */
  readonly ending: () => string | undefined;
  readonly setEnding: (token: string | undefined) => void;
  /** Remembers a token whose user is not known yet. */
  readonly adopt: (token: string) => Promise<void>;
  readonly isStored: () => Promise<boolean>;
};

/** The other tabs' sign-out note (fix round 5 V1), read and written as a mark of the token. */
const notesOf = (
  notes: SignOutNotes | undefined,
): Pick<Session, "isLoggedOutInAnotherTab" | "leaveNote" | "withdrawNote"> => ({
  isLoggedOutInAnotherTab: async (token) =>
    notes !== undefined &&
    (await tryStore(async () => await notes.read(), null)) === noteMark(token),
  leaveNote: async (token) => {
    if (notes !== undefined) {
      await tryStore(async () => {
        await notes.leave(noteMark(token));
      }, undefined);
    }
  },
  withdrawNote: async (token) => {
    if (notes !== undefined) {
      await tryStore(async () => {
        await notes.withdraw(noteMark(token));
      }, undefined);
    }
  },
});

/** The in-memory token (read synchronously by the API client) mirrored to the session store. */
export const createSession = (
  sessionStore: SessionStore,
  notes: SignOutNotes | undefined,
): Session => {
  const store = createStore<AuthState>(() => ({ status: "loading", user: null }));
  let cached: string | undefined;
  let ending: string | undefined;
  let hasEnded = false;
  return {
    adopt: async (token) => {
      cached = token;
      hasEnded = false;
      await sessionStore.set(token);
      store.setState({
        endedElsewhere: undefined,
        endedInAnotherTab: undefined,
        status: "signed-in",
        user: null,
      });
    },
    ready: (async (): Promise<void> => {
      cached = (await sessionStore.get()) ?? undefined;
      store.setState({ status: cached === undefined ? "signed-out" : "signed-in" });
    })(),
    hasEnded: () => hasEnded,
    signIn: async (granted) => {
      cached = granted.token;
      hasEnded = false;
      await sessionStore.set(granted.token);
      store.setState({
        endedElsewhere: undefined,
        endedInAnotherTab: undefined,
        status: "signed-in",
        user: granted.user,
      });
      return granted.user;
    },
    ...notesOf(notes),
    ending: () => ending,
    setEnding: (token) => {
      ending = token;
    },
    signOut: async (reason) => {
      const leaving = cached;
      cached = undefined;
      hasEnded = true;
      // A store that fails to forget still leaves this tab signed out. The store is shared by
      // the browser's tabs: it is cleared only while it still holds the session this tab ends,
      // never another tab's newer one (a stale tab's late 401, round 6 I1). A store that
      // cannot be read is cleared as before.
      const stored = await tryStore(async () => await sessionStore.get(), leaving);
      if (leaving !== undefined && stored === leaving) {
        await tryStore(async () => {
          await sessionStore.clear();
        }, undefined);
      }
      store.setState({
        endedElsewhere: reason !== undefined && "endedElsewhere" in reason ? true : undefined,
        endedInAnotherTab: reason !== undefined && "endedInAnotherTab" in reason ? true : undefined,
        status: "signed-out",
        user: null,
      });
    },
    isStored: async () => (await tryStore(async () => await sessionStore.get(), null)) !== null,
    store,
    token: () => cached,
  };
};
