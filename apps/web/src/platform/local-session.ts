/* eslint-disable @typescript-eslint/require-await -- localStorage implements the async port synchronously */
import type { SessionStore } from "@pace/client";

export const SESSION_KEY = "pace.session";

const read = (): null | string => {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};

/** True when localStorage accepted the write. */
const didPersist = (value: null | string): boolean => {
  try {
    if (value === null) {
      localStorage.removeItem(SESSION_KEY);
    } else {
      localStorage.setItem(SESSION_KEY, value);
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * The bearer token in localStorage. When storage is unavailable (private window, blocked
 * site data) the token lives in memory for this page load instead of failing the login.
 */
export const createLocalSessionStore = (): SessionStore => {
  let memory: null | string = null;
  return {
    clear: async () => {
      memory = null;
      didPersist(null);
    },
    get: async () => read() ?? memory,
    set: async (token) => {
      memory = didPersist(token) ? null : token;
    },
  };
};
/* eslint-enable @typescript-eslint/require-await -- end of the synchronous adapter */
