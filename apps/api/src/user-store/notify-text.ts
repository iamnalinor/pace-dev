import {
  type Answer,
  ANSWERS,
  formatDuration,
  formatLeft,
  type Language,
  minutesBetween,
  type PoolNotification,
  type Settings,
  t,
} from "@pace/core";

import type { InlineButton, OutgoingMessage } from "../shared/telegram-api.ts";

import { clockIn, dayClockIn } from "../shared/clock.ts";
import { POOL_ACTIONS } from "../shared/contract.ts";
import { taskUrl } from "../shared/web-links.ts";

type Zoned = { readonly language: Language; readonly zone: string; readonly now: string };

/** A digest lists every task, but only the first few get a button to open them. */
const LINKED_TASKS = 5;

/** Telegram refuses a message longer than this (characters). */
export const TELEGRAM_TEXT_MAX = 4096;

/**
A phone's body, in UTF-8 bytes: an FCM data message carries 4 KB in all, title, keys and the
pool id included, and the poll queue stores the same text.
*/
export const PHONE_BODY_MAX_BYTES = 2048;

const ELLIPSIS = "…";

/** The characters of a text as a reader sees them (an emoji with its modifiers is one). */
const charactersOf = (text: string): readonly string[] =>
  Array.from(new Intl.Segmenter().segment(text), (part) => part.segment);

/** The text cut to fit, by whole characters, ending in "…" when anything was cut. */
const fitted = (text: string, isFitting: (candidate: string) => boolean): string => {
  if (isFitting(text)) {
    return text;
  }
  const characters = charactersOf(text);
  const cut = (kept: number): string =>
    `${characters.slice(0, kept).join("").trimEnd()}${ELLIPSIS}`;
  // The most characters that fit with the ellipsis: binary search, `low` always fits.
  let low = 0;
  let high = characters.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (isFitting(cut(middle))) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return cut(low);
};

const encoder = new TextEncoder();

const zonedOf = (settings: Pick<Settings, "language" | "timezone">, now: string): Zoned => ({
  language: settings.language,
  now,
  zone: settings.timezone ?? "UTC",
});

/** The answer buttons of a notification, one row: `<code>:<id>` for the bot to handle. */
const answerButtons = (
  notification: PoolNotification,
  language: Language,
): readonly (readonly InlineButton[])[] => {
  const answers: readonly Answer[] = ANSWERS[notification.kind];
  return answers.length === 0
    ? []
    : [
        answers.map((answer) => ({
          data: `${POOL_ACTIONS[answer]}:${notification.id}`,
          label: t(language, `notify.action.${answer}`),
        })),
      ];
};

/** The one-line body of a notification, the same in Telegram (after its emoji) and on a phone. */
const bodyOf = (notification: PoolNotification, zoned: Zoned): string => {
  const { language, zone } = zoned;
  switch (notification.kind) {
    case "login": {
      const { city, country, ip, name } = notification.payload;
      const place = [city, country].filter((part) => part !== undefined && part !== "").join(", ");
      return t(language, "notify.login", { ip, name, place });
    }
    case "deadline_digest": {
      return [
        notification.payload.tasks.length === 1
          ? t(language, "notify.digestTitle")
          : t(language, "notify.digestCount", { count: notification.payload.tasks.length }),
        ...notification.payload.tasks.map(
          (task) =>
            `• ${t(language, "notify.digestRow", {
              left: formatLeft(minutesBetween(zoned.now, task.dueAt), language),
              title: task.title,
              when: dayClockIn(task.dueAt, language, zone),
            })}`,
        ),
      ].join("\n");
    }
    case "event_start": {
      const { end, start, title } = notification.payload;
      return t(language, "notify.eventStart", {
        from: clockIn(start, language, zone),
        title,
        to: clockIn(end, language, zone),
      });
    }
    case "activity_overrun": {
      const { expectMinutes, label, startAt } = notification.payload;
      return t(language, "notify.overrun", {
        duration: formatDuration(expectMinutes, language),
        label,
        time: clockIn(startAt, language, zone),
      });
    }
  }
};

/** A notification as the bot sends it, in the account language and zone, with its buttons. */
export const telegramMessage = (
  notification: PoolNotification,
  settings: Pick<Settings, "language" | "timezone">,
  { now, webOrigin }: { readonly now: string; readonly webOrigin: string },
): OutgoingMessage => {
  const zoned = zonedOf(settings, now);
  const links: readonly (readonly InlineButton[])[] =
    notification.kind === "deadline_digest"
      ? notification.payload.tasks
          .slice(0, LINKED_TASKS)
          .map((task) => [{ label: task.title, url: taskUrl(webOrigin, task.taskId) }])
      : [];
  return {
    buttons: [...answerButtons(notification, zoned.language), ...links],
    text: fitted(bodyOf(notification, zoned), (text) => text.length <= TELEGRAM_TEXT_MAX),
  };
};

/** A notification as a phone shows it: a title and a body without the chat's emoji. */
export const phoneContent = (
  notification: PoolNotification,
  settings: Pick<Settings, "language" | "timezone">,
  now: string,
): { readonly title: string; readonly body: string } => {
  const zoned = zonedOf(settings, now);
  const body = bodyOf(notification, zoned);
  const shown =
    notification.kind === "deadline_digest"
      ? body.split("\n").slice(1).join("\n")
      : body.replace(/^\S+\s/u, "");
  return {
    body: fitted(shown, (text) => encoder.encode(text).length <= PHONE_BODY_MAX_BYTES),
    title:
      notification.kind === "deadline_digest" && notification.payload.tasks.length > 1
        ? t(zoned.language, "notify.digestCount", { count: notification.payload.tasks.length })
        : t(zoned.language, `notify.title.${notification.kind}`),
  };
};
