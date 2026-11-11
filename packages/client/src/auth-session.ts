import { createStore, type StoreApi } from "zustand/vanilla";

import { ok, type Result, type User } from "@pace/core";

import { sessionPersistence } from "./session-persistence.ts";
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

export const SESSION_CHANGED = "session/changed";

export type Granted = { readonly token: string; readonly user: User };

type SignOutReason = { readonly endedElsewhere: true } | { readonly endedInAnotherTab: true };

export type Session = {
  readonly ready: Promise<void>;
  readonly store: StoreApi<AuthState>;
  readonly token: () => string | undefined;
  /** Whether this session ended (signed out, for any reason) and no new one began. */
  readonly hasEnded: () => boolean;
  readonly signIn: (granted: Granted, owner?: number) => Promise<Result<User, "session/changed">>;
  readonly owner: () => number;
  readonly beginSignIn: () => number;
  readonly owns: (owner: number) => boolean;
  readonly suspendSignIn: () => Promise<void>;
  readonly resumeSignIn: () => void;
  /**
  Why, when the person did not sign out here: the server no longer knew the session
  (`endedElsewhere`), or another tab of this browser signed out (`endedInAnotherTab`).
  */
  readonly signOut: (reason?: SignOutReason, owner?: number) => Promise<void>;
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
  readonly adopt: (token: string, owner?: number) => Promise<Result<undefined, "session/changed">>;
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

/** A session that began: no word of an earlier one's end is left. */
const signedIn = (user: null | User): AuthState => ({
  endedElsewhere: undefined,
  endedInAnotherTab: undefined,
  status: "signed-in",
  user,
});

type SessionValues = {
  cached: string | undefined;
  ending: string | undefined;
  hasEnded: boolean;
};
type SessionDeps = {
  readonly values: SessionValues;
  readonly store: StoreApi<AuthState>;
  readonly sessionStore: SessionStore;
  readonly persistence: ReturnType<typeof sessionPersistence>;
};

const saveSession = async (
  deps: SessionDeps,
  granted: { readonly token: string; readonly user: null | User },
  owner: number,
): Promise<Result<undefined, "session/changed">> => {
  const { values, store, persistence } = deps;
  return await persistence.save(granted.token, owner, () => {
    values.cached = granted.token;
    values.hasEnded = false;
    store.setState(signedIn(granted.user));
  });
};

const signOutSession = async (deps: SessionDeps, reason?: SignOutReason): Promise<void> => {
  const { persistence, sessionStore, store, values } = deps;
  persistence.invalidate();
  const leaving = values.cached;
  values.cached = undefined;
  values.hasEnded = true;
  // A different tab's newer session is never cleared by this tab's stale sign-out.
  await persistence.serialize(async () => {
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
  });
};

const sessionWrites = (
  deps: SessionDeps,
): Pick<Session, "adopt" | "signIn" | "signOut" | "suspendSignIn"> => ({
  adopt: async (token, owner = deps.persistence.owner()) =>
    await saveSession(deps, { token, user: null }, owner),
  signIn: async (granted, owner = deps.persistence.owner()) => {
    const saved = await saveSession(deps, granted, owner);
    return saved.ok ? ok(granted.user) : saved;
  },
  signOut: async (reason, owner) => {
    if (owner === undefined || deps.persistence.owns(owner)) {
      await signOutSession(deps, reason);
    }
  },
  suspendSignIn: async () => {
    const { persistence, values, store } = deps;
    const suspended = persistence.suspend();
    values.cached = undefined;
    values.hasEnded = true;
    store.setState({ status: "signed-out", user: null });
    await suspended;
  },
});

const loadSession = async (deps: SessionDeps): Promise<void> => {
  const { persistence, sessionStore, store, values } = deps;
  const owner = persistence.owner();
  const loaded = (await sessionStore.get()) ?? undefined;
  if (persistence.owns(owner)) {
    values.cached = loaded;
    store.setState({ status: loaded === undefined ? "signed-out" : "signed-in" });
  } else if (store.getState().status === "loading") {
    store.setState({ status: "signed-out", user: null });
  }
};

/** The in-memory token mirrored only after an owned, serialized session-store write. */
export const createSession = (
  sessionStore: SessionStore,
  notes: SignOutNotes | undefined,
  canSignIn: () => boolean = () => true,
): Session => {
  const store = createStore<AuthState>(() => ({ status: "loading", user: null }));
  const values: SessionValues = { cached: undefined, ending: undefined, hasEnded: false };
  const persistence = sessionPersistence(sessionStore, canSignIn);
  const deps = { store, values, persistence, sessionStore };
  return {
    ...sessionWrites(deps),
    ...notesOf(notes),
    owner: persistence.owner,
    beginSignIn: persistence.begin,
    owns: persistence.owns,
    resumeSignIn: persistence.resume,
    ready: loadSession(deps),
    hasEnded: () => values.hasEnded,
    ending: () => values.ending,
    setEnding: (token) => {
      values.ending = token;
    },
    isStored: async () => (await tryStore(async () => await sessionStore.get(), null)) !== null,
    store,
    token: () => values.cached,
  };
};
