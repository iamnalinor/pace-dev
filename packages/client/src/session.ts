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

/* eslint-enable @typescript-eslint/require-await -- end of the synchronous adapter */
