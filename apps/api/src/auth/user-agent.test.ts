import { describe, expect, it } from "vitest";

import { clientName, userAgentDetails } from "./user-agent.ts";

/** Real User-Agent strings, as the browsers send them. */
const AGENTS = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  yandexWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.0.0 Safari/537.36",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
  operaWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  chromeChromeOs:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
} as const;

describe("clientName", () => {
  it.each([
    [AGENTS.chromeMac, "Chrome on macOS"],
    [AGENTS.chromeAndroid, "Chrome on Android"],
    [AGENTS.chromeIphone, "Chrome on iPhone"],
    [AGENTS.safariIphone, "Safari on iPhone"],
    [AGENTS.safariIpad, "Safari on iPad"],
    [AGENTS.safariMac, "Safari on macOS"],
    [AGENTS.edgeWindows, "Edge on Windows"],
    [AGENTS.yandexWindows, "Yandex Browser on Windows"],
    [AGENTS.firefoxLinux, "Firefox on Linux"],
    [AGENTS.firefoxWindows, "Firefox on Windows"],
    [AGENTS.operaWindows, "Opera on Windows"],
    [AGENTS.samsungAndroid, "Samsung Internet on Android"],
    [AGENTS.chromeChromeOs, "Chrome on ChromeOS"],
  ])("names %s as %s", (userAgent, name) => {
    expect(clientName(userAgent)).toBe(name);
  });

  it.each([null, "", "curl/8", "Mozilla/5.0"])("names an unknown client (%s) Browser", (agent) => {
    expect(clientName(agent)).toBe("Browser");
  });
});

describe("userAgentDetails", () => {
  it("reads a Mac Chrome: no macOS version, desktop", () => {
    expect(userAgentDetails(AGENTS.chromeMac)).toEqual({
      browser: "Chrome",
      browserVersion: "130",
      formFactor: "desktop",
      os: "macOS",
    });
  });

  it("reads a Samsung phone's brand, model, system and browser", () => {
    expect(userAgentDetails(AGENTS.samsungAndroid)).toEqual({
      brand: "Samsung",
      browser: "Samsung Internet",
      browserVersion: "26",
      formFactor: "phone",
      model: "SM-S918B",
      os: "Android",
      osVersion: "14",
    });
  });

  it("takes the reduced Android token K as no model", () => {
    expect(userAgentDetails(AGENTS.chromeAndroid)).toEqual({
      browser: "Chrome",
      browserVersion: "130",
      formFactor: "phone",
      os: "Android",
      osVersion: "10",
    });
  });

  it("never reads a locale as the model of an old Android", () => {
    const old =
      "Mozilla/5.0 (Linux; U; Android 4.0.3; en-us; GT-I9100 Build/IML74K) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30";
    expect(userAgentDetails(old).model).toBe("GT-I9100");
    const bare =
      "Mozilla/5.0 (Linux; U; Android 4.0; ru-RU) AppleWebKit/534.30 Mobile Safari/534.30";
    expect(userAgentDetails(bare).model).toBeUndefined();
    const noModel =
      "Mozilla/5.0 (Linux; U; Android 2.3; ru-RU; ) AppleWebKit/534.30 Mobile Safari/534.30";
    expect(userAgentDetails(noModel).model).toBeUndefined();
  });

  it("reads a Pixel as Google's", () => {
    const pixel =
      "Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
    expect(userAgentDetails(pixel)).toMatchObject({
      brand: "Google",
      model: "Pixel 8",
      osVersion: "15",
    });
  });

  it("reads iOS versions and the form factor of an iPhone and an iPad", () => {
    expect(userAgentDetails(AGENTS.safariIphone)).toEqual({
      browser: "Safari",
      browserVersion: "18",
      formFactor: "phone",
      os: "iOS",
      osVersion: "18.1",
    });
    expect(userAgentDetails(AGENTS.safariIpad)).toMatchObject({
      formFactor: "tablet",
      osVersion: "17.6",
    });
  });

  it.each([
    [AGENTS.edgeWindows, "Edge", "130"],
    [AGENTS.yandexWindows, "Yandex Browser", "24"],
    [AGENTS.firefoxLinux, "Firefox", "132"],
    [AGENTS.operaWindows, "Opera", "114"],
    [AGENTS.chromeIphone, "Chrome", "130"],
  ])("reads the browser and version of %s", (agent, browser, browserVersion) => {
    expect(userAgentDetails(agent)).toMatchObject({ browser, browserVersion });
  });

  it("says just Windows when 10 and 11 cannot be told, and the release when one is named", () => {
    expect(userAgentDetails(AGENTS.edgeWindows).osVersion).toBeUndefined();
    expect(
      userAgentDetails("Mozilla/5.0 (Windows NT 6.1; Win64; x64) Chrome/109.0.0.0 Safari/537.36")
        .osVersion,
    ).toBe("7");
  });

  it.each([null, "", "curl/8", "HeadlessChrome"])(
    "has nothing for an unknown client (%s)",
    (agent) => {
      expect(userAgentDetails(agent)).toEqual({});
    },
  );
});
