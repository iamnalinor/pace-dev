export type FakeSecureStore = {
  readonly deleteItemAsync: (key: string) => Promise<void>;
  readonly getItemAsync: (key: string) => Promise<null | string>;
  readonly setItemAsync: (key: string, value: string) => Promise<void>;
  readonly values: Map<string, string>;
};

/** In-memory stand-in for `expo-secure-store` (the three functions Pace uses). */
export const createFakeSecureStore = (): FakeSecureStore => {
  const values = new Map<string, string>();
  return {
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      values.set(key, value);
    },
    values,
  };
};
