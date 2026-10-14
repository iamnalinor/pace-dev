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
        t(language, "notify.digestTitle"),
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
    text: bodyOf(notification, zoned),
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
  return {
    body:
      notification.kind === "deadline_digest"
        ? body.split("\n").slice(1).join("\n")
        : body.replace(/^\S+\s/u, ""),
    title: t(zoned.language, `notify.title.${notification.kind}`),
  };
};
