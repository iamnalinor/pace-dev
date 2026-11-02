import { en, formatDuration, ru } from "./catalog.ts";

/**
What a screen must never say while the account's log has not arrived yet (QA rounds 17 M4, 18 M5,
19 M1): its empty states and its zero totals, in either language. Read from the catalogs, so a new
screen's empty state is covered once its key is named like the others (`….empty`, `….nothing…`).
*/

/** Empty states of what lives in someone else's store than the log: true while the log is away. */
const NOT_FROM_THE_LOG = new Set([
  // The bell's pool and the sessions list are the server's, not the log's.
  "notifications.empty",
  "devices.nothingYet",
  // The calendar comes from the phone or the server, not the log.
  "time.calendar.nothingNear",
  // The assistant's answer inside one card, never a screen's state.
  "decisions.nothing",
]);

const escape = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

/** The key's text in both languages, its placeholders matching anything. */
const texts = (key: keyof typeof en, fill: (placeholder: string) => string): readonly string[] =>
  [en[key], ru[key]].map((text) =>
    text
      .split(/(\{\w+\})/u)
      .map((part) => (/^\{\w+\}$/u.test(part) ? fill(part) : escape(part)))
      .join(""),
  );

const keys = Object.keys(en) as (keyof typeof en)[];

/** The assistant's answers, the action errors and the bot's messages: replies, never a screen. */
const REPLIES = /^(?:assistant|actionError|bot)\./u;

const emptyStates = keys
  .filter((key) => /^(?:empty|nothing|noApps$|noDeviceData$)/u.test(key.split(".").at(-1) ?? ""))
  .filter((key) => !NOT_FROM_THE_LOG.has(key) && !REPLIES.test(key))
  .flatMap((key) => texts(key, () => ".*"));

/** A total line ("Tracked {duration}") with nothing in it. */
const zeroTotals = keys
  .filter((key) => en[key].includes("{duration}"))
  .filter((key) => en[key].startsWith("Tracked") || ru[key].startsWith("Учтено"))
  .flatMap((key) =>
    texts(key, (placeholder) =>
      placeholder === "{duration}"
        ? `(?:${escape(formatDuration(0, "en"))}|${escape(formatDuration(0, "ru"))})`
        : ".*",
    ),
  );

// eslint-disable-next-line security/detect-non-literal-regexp -- built from the catalogs' own texts, escaped
export const EMPTY_COPY = new RegExp(`(?:${[...emptyStates, ...zeroTotals].join("|")})`, "u");
