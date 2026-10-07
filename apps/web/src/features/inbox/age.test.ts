import { describe, expect, it } from "vitest";

import { t } from "@pace/core";

import { formatAge } from "./age.ts";

const en = (key: Parameters<typeof t>[1], params?: Parameters<typeof t>[2]): string =>
  t("en", key, params);

describe("formatAge", () => {
  it("reads minutes, hours and days in whole units", () => {
    expect(formatAge(0, en)).toBe("0m");
    expect(formatAge(59, en)).toBe("59m");
    expect(formatAge(60, en)).toBe("1h");
    expect(formatAge(24 * 60 - 1, en)).toBe("23h");
    expect(formatAge(6 * 24 * 60, en)).toBe("6d");
  });
});
