/**
Browsers by the token their User-Agent carries, most specific first: Edge, Yandex, Opera and
Samsung Internet also say "Chrome", and Chrome also says "Safari".
*/
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//u, "Edge"],
  [/\bYaBrowser\//u, "Yandex Browser"],
  [/\b(?:OPR|OPiOS|Opera)\b/u, "Opera"],
  [/\bSamsungBrowser\//u, "Samsung Internet"],
  [/\b(?:Firefox|FxiOS)\//u, "Firefox"],
  [/\b(?:Chrome|CriOS)\//u, "Chrome"],
  [/\bVersion\/[\d.].*\bSafari\//u, "Safari"],
];

/**
Systems the same way: an iPhone or iPad says "like Mac OS X", and Android and ChromeOS say
"Linux", so those come first.
*/
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b/u, "iPhone"],
  [/\biPad\b/u, "iPad"],
  [/\bAndroid\b/u, "Android"],
  [/\bCrOS\b/u, "ChromeOS"],
  [/\bWindows\b/u, "Windows"],
  [/\bMac OS X\b/u, "macOS"],
  [/\bLinux\b/u, "Linux"],
];

const first = (table: readonly (readonly [RegExp, string])[], text: string): null | string =>
  table.find(([pattern]) => pattern.test(text))?.[1] ?? null;

/**
A session's readable name from the User-Agent that opened it, "<Browser> on <OS>" ("Chrome on
macOS", "Safari on iPhone"), so the person can tell their sessions apart; a client that is not
a known browser is just "Browser".
*/
export const clientName = (userAgent: null | string): string => {
  const browser = userAgent === null ? null : first(BROWSERS, userAgent);
  if (userAgent === null || browser === null) {
    return "Browser";
  }
  const system = first(SYSTEMS, userAgent);
  return system === null ? browser : `${browser} on ${system}`;
};

export type FormFactor = "desktop" | "phone" | "tablet";

/** What a User-Agent honestly tells about the device; a part it does not carry is absent. */
export type UserAgentDetails = {
  readonly brand?: string;
  readonly model?: string;
  readonly os?: string;
  readonly osVersion?: string;
  readonly browser?: string;
  readonly browserVersion?: string;
  readonly formFactor?: FormFactor;
};

const BROWSER_VERSIONS: Readonly<Record<string, RegExp>> = {
  Chrome: /\b(?:Chrome|CriOS)\/(\d+)/u,
  Edge: /\bEdg(?:e|A|iOS)?\/(\d+)/u,
  Firefox: /\b(?:Firefox|FxiOS)\/(\d+)/u,
  Opera: /\b(?:OPR|OPiOS|Opera)\/(\d+)/u,
  Safari: /\bVersion\/(\d+)/u,
  "Samsung Internet": /\bSamsungBrowser\/(\d+)/u,
  "Yandex Browser": /\bYaBrowser\/(\d+)/u,
};

/** Windows NT versions that name one release; 10.0 is both 10 and 11, so it is just "Windows". */
const WINDOWS_VERSIONS: Readonly<Record<string, string>> = { "6.1": "7", "6.2": "8", "6.3": "8.1" };

/** Brands a model token may lead with ("SAMSUNG SM-S918B", "Xiaomi 23021RAA2Y"). */
const BRANDS: ReadonlySet<string> = new Set([
  "google",
  "honor",
  "huawei",
  "motorola",
  "nokia",
  "oneplus",
  "oppo",
  "realme",
  "samsung",
  "sony",
  "vivo",
  "xiaomi",
]);

const capitalized = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** The model an Android UA carries ("Pixel 8"); the reduced "K" and "Build/…" tails are no model. */
const androidDevice = (userAgent: string): Pick<UserAgentDetails, "brand" | "model"> => {
  const token = /\bAndroid [\d.]+; ([^;)]+)/u.exec(userAgent)?.[1];
  const raw = token?.split(" Build/", 1)[0]?.trim();
  if (raw === undefined || /^(?:.|Android|Mobile|Tablet)$/iu.test(raw)) {
    return {};
  }
  const [word = "", ...rest] = raw.split(/\s+/u);
  if (BRANDS.has(word.toLowerCase()) && rest.length > 0) {
    return { brand: capitalized(word), model: rest.join(" ") };
  }
  return /^Pixel\b/u.test(raw) ? { brand: "Google", model: raw } : { model: raw };
};

const versionOf = (userAgent: string, pattern: RegExp): string | undefined =>
  pattern.exec(userAgent)?.[1]?.replaceAll("_", ".");

const formFactorOf = (os: string, userAgent: string): FormFactor => {
  if (os === "iPhone") {
    return "phone";
  }
  if (os === "iPad") {
    return "tablet";
  }
  if (os === "Android") {
    return /\bMobile\b/u.test(userAgent) ? "phone" : "tablet";
  }
  return "desktop";
};

const osVersionOf = (os: string, userAgent: string): string | undefined => {
  switch (os) {
    case "Android": {
      return versionOf(userAgent, /\bAndroid ([\d.]+)/u);
    }
    case "iPad":
    case "iPhone": {
      return versionOf(userAgent, /\bOS ([\d_]+) like Mac OS X/u);
    }
    case "Windows": {
      return WINDOWS_VERSIONS[/\bWindows NT (\d+\.\d+)/u.exec(userAgent)?.[1] ?? ""];
    }
    default: {
      return undefined;
    }
  }
};

const systemDetails = (
  userAgent: string,
): Pick<UserAgentDetails, "formFactor" | "os" | "osVersion"> => {
  const system = first(SYSTEMS, userAgent);
  if (system === null) {
    return {};
  }
  const osVersion = osVersionOf(system, userAgent);
  return {
    formFactor: formFactorOf(system, userAgent),
    os: system === "iPad" || system === "iPhone" ? "iOS" : system,
    ...(osVersion !== undefined && { osVersion }),
  };
};

const browserOf = (userAgent: string): Pick<UserAgentDetails, "browser" | "browserVersion"> => {
  const browser = first(BROWSERS, userAgent);
  if (browser === null) {
    return {};
  }
  const version = versionOf(userAgent, BROWSER_VERSIONS[browser] ?? /$^/u);
  return { browser, ...(version !== undefined && { browserVersion: version }) };
};

/**
Everything the User-Agent honestly says about the device: browser and its major version, the
system and its version (macOS and Linux never tell theirs), the model an Android carries, the
form factor. Nothing is guessed: what is not in the string is absent.
*/
export const userAgentDetails = (userAgent: null | string): UserAgentDetails =>
  userAgent === null
    ? {}
    : {
        ...(userAgent.includes("Android") && androidDevice(userAgent)),
        ...systemDetails(userAgent),
        ...browserOf(userAgent),
      };
