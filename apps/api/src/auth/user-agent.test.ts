import { describe, expect, it } from "vitest";

import { clientName } from "./user-agent.ts";

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
