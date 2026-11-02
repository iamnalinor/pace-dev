export type FakeSecureStore = {
  readonly deleteItemAsync: (key: string) => Promise<void>;
  readonly getItemAsync: (key: string) => Promise<null | string>;
  readonly setItemAsync: (key: string, value: string) => Promise<void>;
  readonly values: Map<string, string>;
  /** While set, every write is refused, as a full or locked keystore would. */
  readonly writes: { isRefused: boolean };
};

/** In-memory stand-in for `expo-secure-store` (the three functions Pace uses). */
export const createFakeSecureStore = (): FakeSecureStore => {
  const values = new Map<string, string>();
  const writes = { isRefused: false };
  return {
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      if (writes.isRefused) {
        throw new Error("keystore refused the write");
      }
      values.set(key, value);
    },
    values,
    writes,
  };
};
