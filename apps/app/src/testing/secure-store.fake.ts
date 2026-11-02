export type FakeSecureStore = {
  readonly deleteItemAsync: (key: string) => Promise<void>;
  readonly getItemAsync: (key: string) => Promise<null | string>;
  readonly setItemAsync: (key: string, value: string) => Promise<void>;
  readonly values: Map<string, string>;
  /** While set, every read waits for it: a slow first read on a cold start. */
  readGate: null | Promise<unknown>;
};

/** In-memory stand-in for `expo-secure-store` (the three functions Pace uses). */
export const createFakeSecureStore = (): FakeSecureStore => {
  const values = new Map<string, string>();
  const store: FakeSecureStore = {
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
    getItemAsync: async (key) => {
      await store.readGate;
      return values.get(key) ?? null;
    },
    readGate: null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    values,
  };
  return store;
};
