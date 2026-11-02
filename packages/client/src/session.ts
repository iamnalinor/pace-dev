/* eslint-disable @typescript-eslint/require-await -- the in-memory store implements the async port synchronously */

/** Where the bearer token lives between launches (localStorage, SecureStore, ...). */
export type SessionStore = {
  readonly get: () => Promise<null | string>;
  readonly set: (token: string) => Promise<void>;
  readonly clear: () => Promise<void>;
};

export const createMemorySessionStore = (): SessionStore => {
  let token: null | string = null;
  return {
    clear: async () => {
      token = null;
    },
    get: async () => token,
    set: async (value) => {
      token = value;
    },
  };
};

/**
Word one tab of a browser profile leaves for the others that it signed a session out on purpose
(a log-out), kept where they all read it (localStorage): their 401 for that session then says
"you signed out in another tab", not "another device" (fix round 5 V1). `mark` stands for the
token (never the token itself). The app has no other tabs, so it has none.
*/
export type SignOutNotes = {
  readonly leave: (mark: string) => Promise<void>;
  /** The last mark left, `null` for none. */
  readonly read: () => Promise<null | string>;
};

/** Notes shared by whoever holds this object (tests play two tabs with one). */
export const createMemorySignOutNotes = (): SignOutNotes => {
  let mark: null | string = null;
  return {
    leave: async (value) => {
      mark = value;
    },
    read: async () => mark,
  };
};

/* eslint-enable @typescript-eslint/require-await -- end of the synchronous adapter */

/**
What a sign-out note keeps of a token: a short hash (FNV-1a), enough to tell this session's note
from an older one, and nothing that could be sent as the token.
*/
export const noteMark = (token: string): string => {
  let hash = 0x81_1c_9d_c5;
  for (const char of token) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 0x01_00_01_93) >>> 0;
  }
  return `ended:${hash.toString(16)}`;
};

/** Runs a call to a device store; a store that fails counts as one that keeps nothing. */
export const tryStore = async <T>(call: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await call();
  } catch {
    return fallback;
  }
};
