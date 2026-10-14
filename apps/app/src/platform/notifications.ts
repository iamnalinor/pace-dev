import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import type { ApiClient } from "@pace/client";

import {
  type Answer,
  ANSWERS,
  endpoints,
  type Language,
  type NotificationKind,
  t,
} from "@pace/core";

/** The Android channel the pool's notifications go to (users can silence it in system settings). */
const CHANNEL_ID = "notifications";

/** How this phone gets the pool's notifications as system ones (see `registerPush`). */
export type PushMethod = "fcm" | "none" | "poll";

const METHOD_KEY = "pace.push.method";
const CURSOR_KEY = "pace.push.cursor";

/**
Never asks: the onboarding and Settings → Permissions do, with the reason shown first. Without
the permission the phone gets no system notifications; the feed still has everything.
*/
const hasPermission = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
};

const readKey = async (key: string): Promise<null | string> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

/** The push method this phone registered last (`none` before it ever did). */
export const pushMethodOf = async (): Promise<PushMethod> => {
  const stored = await readKey(METHOD_KEY);
  return stored === "fcm" || stored === "poll" ? stored : "none";
};

/**
The answer buttons of each answerable kind, as notification categories: tapping one answers in
the background (the app is not opened), through the same endpoint every channel uses.
*/
export const setupNotificationCategories = async (language: Language): Promise<void> => {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    importance: Notifications.AndroidImportance.HIGH,
    name: t(language, "notify.channel"),
  });
  for (const kind of ["event_start", "activity_overrun"] as const) {
    const answers: readonly Answer[] = ANSWERS[kind];
    await Notifications.setNotificationCategoryAsync(
      kind,
      answers.map((answer) => ({
        buttonTitle: t(language, `notify.action.${answer}`),
        identifier: answer,
        options: { opensAppToForeground: false },
      })),
    );
  }
};

/** Where a tap on a notification of `kind` opens the app. */
const urlOf = (kind: NotificationKind): string =>
  kind === "deadline_digest" ? "/" : "/notifications";

/**
Shows a notification of the pool as a system notification, under the pool id: shown again (a
retried delivery), it replaces itself instead of stacking.
*/
export const showPoolNotification = async (notice: {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
}): Promise<void> => {
  await Notifications.scheduleNotificationAsync({
    content: {
      body: notice.body,
      data: { kind: notice.kind, notificationId: notice.id, url: urlOf(notice.kind) },
      title: notice.title,
      ...(ANSWERS[notice.kind].length > 0 && { categoryIdentifier: notice.kind }),
    },
    identifier: notice.id,
    trigger: { channelId: CHANNEL_ID },
  });
};

/** Takes a shown notification of the pool away (resolved somewhere else). */
export const dismissPoolNotification = async (id: string): Promise<void> => {
  try {
    await Notifications.dismissNotificationAsync(id);
  } catch {
    // Not shown (any more): nothing to take away.
  }
};

/**
Fetches what waits for this phone when it polls (its background check, the open app on a live
notice), shows or takes back each entry and acknowledges them with the next fetch's cursor.
*/
export const pollNow = async (api: ApiClient): Promise<number> => {
  const stored = Number(await readKey(CURSOR_KEY));
  const after = Number.isFinite(stored) ? stored : 0;
  const { cursor, entries } = await api.call(endpoints.notifications.poll, { query: { after } });
  for (const entry of entries) {
    if (entry.type === "dismiss") {
      await dismissPoolNotification(entry.notificationId);
    } else if (entry.notification !== null && entry.notification.resolvedAt === null) {
      await showPoolNotification({
        body: entry.body,
        id: entry.notificationId,
        kind: entry.notification.kind,
        title: entry.title,
      });
    }
  }
  await SecureStore.setItemAsync(CURSOR_KEY, String(cursor));
  return entries.length;
};

/** The phone's FCM token; `null` without Google Play services (or Firebase in the build). */
const fcmToken = async (): Promise<null | string> => {
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    return typeof token.data === "string" && token.data !== "" ? token.data : null;
  } catch {
    return null;
  }
};

/**
Tells the server how this phone gets system notifications, exactly one way: Firebase when the
server offers it and the phone has a Google token; else polling (its background check and the
open app fetch them); `none` without the notification permission. Run on every start (a token
may have changed) and when the server says its methods changed.
*/
export const registerPush = async (api: ApiClient): Promise<PushMethod> => {
  const choose = async (): Promise<PushMethod> => {
    if (!(await hasPermission())) {
      await api.call(endpoints.notifications.push, { body: { method: "none" } });
      return "none";
    }
    const { pushMethods } = await api.call(endpoints.notifications.pushMethods, {});
    const token = pushMethods.includes("fcm") ? await fcmToken() : null;
    if (typeof token === "string") {
      await api.call(endpoints.notifications.push, { body: { endpoint: token, method: "fcm" } });
      return "fcm";
    }
    await api.call(endpoints.notifications.push, { body: { method: "poll" } });
    return "poll";
  };
  const method = await choose();
  await SecureStore.setItemAsync(METHOD_KEY, method);
  return method;
};

/** The pool id a notification response or a tapped notification carries, if any. */
export const notificationIdOf = (data: unknown): null | string => {
  const id: unknown =
    typeof data === "object" && data !== null && "notificationId" in data
      ? data.notificationId
      : null;
  return typeof id === "string" ? id : null;
};

const ANSWER_IDS: ReadonlySet<string> = new Set(["attended", "skipped", "still", "stopped"]);

/** Whether an action identifier is one of the answer buttons. */
export const isAnswer = (identifier: string): identifier is Answer => ANSWER_IDS.has(identifier);
