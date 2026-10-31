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
