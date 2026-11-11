import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

import type { ApiClient } from "@pace/client";

import { serially } from "#app/platform/serially.ts";
import { sessionHashOf } from "#app/platform/session-fingerprint.ts";
import { readSessionValue, writeSessionValue } from "#app/platform/session-value.ts";
import {
  type Answer,
  ANSWERABLE_KINDS,
  ANSWERS,
  endpoints,
  type Language,
  LANGUAGES,
  type NotificationKind,
  notificationPath,
  t,
} from "@pace/core";

/** The Android channel the pool's notifications go to (users can silence it in system settings). */
const CHANNEL_ID = "notifications";

export {
  isBackgroundStepNeeded,
  loadOfferedMethods,
  loadPushState,
  type PushMethod,
  pushMethodOf,
  type PushState,
  pushStore,
  registerPush,
  setPushChoice,
} from "#app/platform/push-registration.ts";

const CURSOR_KEY = "pace.push.cursor";
const LANGUAGE_KEY = "pace.notify.language";
const readKey = async (key: string): Promise<null | string> => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

/**
The answer buttons of each answerable kind, as notification categories: tapping one answers in
the background (the app is not opened), through the same endpoint every channel uses.
*/
export const setupNotificationCategories = async (language: Language): Promise<void> => {
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    importance: Notifications.AndroidImportance.HIGH,
    name: t(language, "notify.channel"),
  });
  for (const kind of ANSWERABLE_KINDS) {
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

/**
Shows a notification of the pool as a system notification, under the pool id: shown again (a
retried delivery), it replaces itself instead of stacking.
*/
export const showPoolNotification = async (notice: {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly sessionHash: string;
  readonly url?: string;
}): Promise<void> => {
  await Notifications.scheduleNotificationAsync({
    content: {
      body: notice.body,
      data: {
        kind: notice.kind,
        notificationId: notice.id,
        sessionHash: notice.sessionHash,
        url: notice.url ?? "/notifications",
      },
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

/** What a shown notification carries, as Android hands it back with a tapped button. */
export type ShownContent = {
  readonly title?: null | string;
  readonly body?: null | string;
  readonly data?: unknown;
  readonly categoryIdentifier?: null | string;
};

const languageOf = async (): Promise<Language> => {
  const stored = await readKey(LANGUAGE_KEY);
  return LANGUAGES.find((language) => language === stored) ?? "en";
};

/** The notification shown again under its id, its text led by the line saying the answer failed. */
const showNotSent = async (id: string, content: ShownContent): Promise<void> => {
  const line = t(await languageOf(), "notifications.failedAction");
  const body = content.body ?? "";
  await Notifications.scheduleNotificationAsync({
    content: {
      body: body.startsWith(line) ? body : `${line}\n${body}`,
      data: (content.data ?? {}) as Record<string, unknown>,
      title: content.title ?? "",
      ...(typeof content.categoryIdentifier === "string" && {
        categoryIdentifier: content.categoryIdentifier,
      }),
    },
    identifier: id,
    trigger: { channelId: CHANNEL_ID },
  });
};

/**
An answer button tapped (in the background or with the app open): the answer is saved first,
and only then does the notification go. When it is not saved (offline, signed out, refused),
the notification stays, shown again under its id with a line saying the answer did not go
through, so its buttons can be tapped again.
*/
export const answerFromButton = async ({
  content,
  id,
  save,
  stillCurrent,
}: {
  readonly id: string;
  readonly content: ShownContent;
  readonly save: () => Promise<boolean>;
  readonly stillCurrent: () => Promise<boolean>;
}): Promise<void> => {
  if (!(await stillCurrent())) {
    await dismissPoolNotification(id);
    return;
  }
  let isSaved = false;
  try {
    isSaved = await save();
  } catch {
    // Offline or refused: not saved.
  }
  if (!(await stillCurrent())) {
    await dismissPoolNotification(id);
    return;
  }
  await (isSaved ? dismissPoolNotification(id) : showNotSent(id, content));
};

/**
Fetches what waits for this phone when it polls (its background check, the open app on a live
notice), shows or takes back each entry and acknowledges them with the next fetch's cursor.
*/
type PollEntries = ReturnType<typeof endpoints.notifications.poll.output.parse>["entries"];

const didApplyPollEntries = async ({
  entries,
  session,
  api,
}: {
  readonly entries: PollEntries;
  readonly session: string;
  readonly api: ApiClient;
}): Promise<boolean> => {
  for (const entry of entries) {
    if (!api.isCurrentSession(session)) {
      return false;
    }
    if (entry.type === "dismiss") {
      await dismissPoolNotification(entry.notificationId);
    } else if (entry.notification !== null && entry.notification.resolvedAt === null) {
      await showPoolNotification({
        body: entry.body,
        id: entry.notificationId,
        kind: entry.notification.kind,
        url: notificationPath(entry.notification),
        sessionHash: await sessionHashOf(session),
        title: entry.title,
      });
      if (!api.isCurrentSession(session)) {
        await dismissPoolNotification(entry.notificationId);
        return false;
      }
    }
  }
  return true;
};

const pollForSession = async (api: ApiClient, session: string): Promise<number> => {
  const stored = await readSessionValue(CURSOR_KEY, session);
  if (!api.isCurrentSession(session)) {
    return 0;
  }
  const after =
    typeof stored === "number" && Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  const { cursor, entries } = await api.call(endpoints.notifications.poll, { query: { after } });
  if (
    !api.isCurrentSession(session) ||
    !(await didApplyPollEntries({ entries, session, api })) ||
    !api.isCurrentSession(session)
  ) {
    return 0;
  }
  await writeSessionValue({
    key: CURSOR_KEY,
    session,
    value: cursor,
    isCurrentSession: () => api.isCurrentSession(session),
  });
  return entries.length;
};

export const pollNow = async (api: ApiClient): Promise<number> => {
  const session = api.currentSessionToken();
  return session === undefined
    ? 0
    : await serially(session, async () => await pollForSession(api, session));
};
