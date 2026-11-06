import { FirebaseConfigReasonSchema, t } from "@pace/core";

import { configurationErrorKey } from "./configuration-error.ts";

describe("configuration reason copy", () => {
  it.each(FirebaseConfigReasonSchema.options)("localizes %s in both languages", (reason) => {
    const key = configurationErrorKey(reason);
    expect(key).not.toBe("server.misconfigured");
    expect(t("en", key)).not.toBe(key);
    expect(t("ru", key)).not.toBe(t("en", key));
  });

  it("uses a generic explanation when the server's reason was unknown", () => {
    expect(configurationErrorKey(null)).toBe("server.misconfigured");
  });
});
