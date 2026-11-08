/** In-memory stand-in for `expo-sqlite/kv-store` (the synchronous calls the drafts use). */
export const createFakeKvStore = () => {
  const values = new Map<string, string>();
  const storage = {
    getItemSync: (key: string): null | string => values.get(key) ?? null,
    removeItemSync: (key: string): boolean => values.delete(key),
    setItemSync: (key: string, value: string): void => {
      values.set(key, value);
    },
    values,
  };
  return { __esModule: true, default: storage };
};
