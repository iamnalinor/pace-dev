import type { KeyValue } from "../../shared/ports/key-value.ts";

export const keyValue = (binding: KVNamespace): KeyValue => ({
  delete: async (key) => {
    await binding.delete(key);
  },
  get: async (key: string, format?: "json") =>
    format === "json" ? await binding.get(key, "json") : await binding.get(key),
  list: async (options) => await binding.list(options),
  put: async (key, value) => {
    await binding.put(key, value);
  },
});
