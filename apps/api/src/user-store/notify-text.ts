import {
  type CoreState,
  type Critical,
  type Digest,
  formatRelativeDay,
  type Language,
  type NotifyMessage,
  type Stuck,
  t,
} from "@pace/core";

import type { OutgoingMessage } from "../shared/telegram-api.ts";

import { clockIn } from "../shared/clock.ts";
import { NOTIFY_ACTIONS } from "../shared/contract.ts";

type Zoned = { readonly language: Language; readonly zone: string; readonly now: string };

const button = (language: Language, key: "cancelTask" | "markDone" | "snooze" | "stillWaiting", data: string) => ({
  data,
  label: t(language, `notify.${key}`),
});

const dueText = (dueAt: string, { language, now, zone }: Zoned): string =>
  `${formatRelativeDay(dueAt, now, { language, tz: zone })} ${clockIn(dueAt, language, zone)}`;

const criticalText = (message: Critical, zoned: Zoned): OutgoingMessage => {
  const { language } = zoned;
  const text =
    message.rule === "deadline" && message.dueAt !== null
      ? t(language, "notify.criticalDeadline", {
          progress: Math.round(message.progress * 100),
          title: message.title,
          when: dueText(message.dueAt, zoned),
        })
      : t(language, "notify.criticalScore", { title: message.title });
  return {
    buttons: [
      [
        button(language, "snooze", `${NOTIFY_ACTIONS.snooze}:${message.taskId}`),
        button(language, "markDone", `${NOTIFY_ACTIONS.done}:${message.taskId}`),
      ],
    ],
    text,
  };
};

const stuckText = (message: Stuck, { language }: Zoned): OutgoingMessage => ({
  buttons: [
    [
      button(
        language,
        message.rule === "waiting" ? "stillWaiting" : "snooze",
        `${NOTIFY_ACTIONS.snooze}:${message.taskId}`,
      ),
      button(language, "cancelTask", `${NOTIFY_ACTIONS.cancel}:${message.taskId}`),
    ],
  ],
  text: t(language, message.rule === "waiting" ? "notify.stuckWaiting" : "notify.stuckIdle", {
    days: message.days,
    title: message.title,
  }),
});

const digestText = (digest: Digest, zoned: Zoned): OutgoingMessage => {
  const { language, zone } = zoned;
  const rows = digest.top.map((row) => {
    const due = row.dueAt === null ? "" : ` · ${dueText(row.dueAt, zoned)}`;
    const late = row.isLate ? ` · ${t(language, "notify.digestLate")}` : "";
    return `• ${row.title}${due}${late}`;
  });
  const lines = [
    t(language, "notify.digestTitle", { time: clockIn(digest.window, language, zone) }),
    ...(rows.length === 0 ? [t(language, "bot.nowEmpty")] : rows),
    ...(digest.more > 0 ? [t(language, "notify.digestMore", { count: digest.more })] : []),
    ...(digest.reviewCount > 0 ? [t(language, "notify.digestReview", { count: digest.reviewCount })] : []),
    ...(digest.inboxCount > 0 ? [t(language, "notify.digestInbox", { count: digest.inboxCount })] : []),
  ];
  return { buttons: [], text: lines.join("\n") };
};

/** A notification as the bot sends it, in the account language and zone. */
export const notificationText = (
  message: NotifyMessage,
  state: Pick<CoreState, "settings">,
  now: string,
): OutgoingMessage => {
  const zoned: Zoned = {
    language: state.settings.language,
    now,
    zone: state.settings.timezone ?? "UTC",
  };
  switch (message.kind) {
    case "critical": {
      return criticalText(message, zoned);
    }
    case "digest": {
      return digestText(message, zoned);
    }
    case "stuck": {
      return stuckText(message, zoned);
    }
  }
};
