import { beforeEach, describe, expect, it } from "vitest";

import { DEVICE_ID_KEY, readDeviceId } from "./device-id.ts";

describe("readDeviceId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("creates a non-empty id once and keeps it", () => {
    const first = readDeviceId();
    expect(first.length).toBeGreaterThan(8);
    expect(readDeviceId()).toBe(first);
    expect(localStorage.getItem(DEVICE_ID_KEY)).toBe(first);
  });

  it("reuses a stored id", () => {
    localStorage.setItem(DEVICE_ID_KEY, "web-abc");
    expect(readDeviceId()).toBe("web-abc");
  });
});
