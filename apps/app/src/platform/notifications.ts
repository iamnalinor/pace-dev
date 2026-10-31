import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { createStore } from "zustand/vanilla";

import { appFirebaseProject } from "#app/platform/firebase-project.ts";
import { sessionHashOf } from "#app/platform/session-fingerprint.ts";
import { seriallyBySession } from "#app/platform/session-poll-queue.ts";
import { readSessionValue, writeSessionValue } from "#app/platform/session-value.ts";
import { type ApiClient, ApiError } from "@pace/client";
import {
  type Answer,
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

/** How this phone gets the pool's notifications as system ones (see `registerPush`). */
export type PushMethod = "fcm" | "none" | "poll";

const METHOD_KEY = "pace.push.method";
/** The method picked in Settings; absent: automatic (Google's push when there is one). */
const CHOICE_KEY = "pace.push.choice";
const CURSOR_KEY = "pace.push.cursor";
/** The language the buttons were set up in: a background answer that fails says so in it. */
const LANGUAGE_KEY = "pace.notify.language";

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

const PUSH_METHODS: readonly PushMethod[] = ["fcm", "poll", "none"];

const asMethod = (stored: null | string): null | PushMethod =>
  PUSH_METHODS.find((method) => method === stored) ?? null;

/** The push method this phone registered last (`none` before it ever did). */
export const pushMethodOf = async (): Promise<PushMethod> =>
  asMethod(await readKey(METHOD_KEY)) ?? "none";

export type PushState = {
  /** What this phone registered last; `null` until it is known. */
  readonly method: null | PushMethod;
  /** The method picked in Settings; `null`: automatic. */
  readonly choice: null | PushMethod;
  /** `false` when it registered none because notifications are not allowed. */
  readonly isAllowed: boolean;
  /**
  The methods of those the server took when last asked that this phone can use; `null` until it
  answered once.
  */
  readonly offered: null | readonly ("fcm" | "poll")[];
  /** The server sends with another Firebase project than this build's: Google's push cannot work. */
  readonly isFcmOtherProject: boolean;
};

/**
This phone's push state, for Settings to follow as it changes (registered again, picked, the
server's methods changed).
*/
export const pushStore = createStore<PushState>(() => ({
  choice: null,
  isAllowed: true,
  isFcmOtherProject: false,
  method: null,
  offered: null,
}));

type MethodsAnswer = {
  readonly pushMethods: readonly ("fcm" | "poll")[];
  readonly fcmProject: null | string;
};

/**
The methods this phone can use of those the server takes, into `pushStore`. Google's push only
when the server sends with this build's Firebase project: FCM refuses every push to a token of
another project, so nothing would ever arrive (when either side does not say, it is tried, and the
server refuses the token after its first refused push).
*/
const usableMethods = ({ fcmProject, pushMethods }: MethodsAnswer): readonly ("fcm" | "poll")[] => {
  const own = appFirebaseProject();
  const isFcmOtherProject = own !== null && fcmProject !== null && own !== fcmProject;
  const offered = pushMethods.filter((method) => method !== "fcm" || !isFcmOtherProject);
  pushStore.setState({ isFcmOtherProject, offered });
  return offered;
};

/** Asks the server which methods it takes now, into `pushStore`; offline, what it said last stays. */
export const loadOfferedMethods = async (api: ApiClient): Promise<void> => {
  try {
    usableMethods(await api.call(endpoints.notifications.pushMethods, {}));
  } catch {
    // Offline: the methods it offered last (or the one in use) are still shown.
  }
};

/** Reads what was stored into `pushStore` (Settings opened before this start registered). */
export const loadPushState = async (): Promise<void> => {
  const [method, choice] = [await readKey(METHOD_KEY), await readKey(CHOICE_KEY)];
  pushStore.setState((state) => ({
    choice: asMethod(choice),
    method: state.method ?? asMethod(method),
  }));
};

/** Picks how this phone shows notifications (`null`: automatic); `registerPush` honours it. */
export const setPushChoice = async (choice: null | PushMethod): Promise<void> => {
  await (choice === null
    ? SecureStore.deleteItemAsync(CHOICE_KEY)
    : SecureStore.setItemAsync(CHOICE_KEY, choice));
  pushStore.setState({ choice });
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
    : await seriallyBySession(session, async () => await pollForSession(api, session));
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

/** Registers one method; `false` when the server refuses it (409: not accepted right now). */
const isRegistered = async (api: ApiClient, method: "fcm" | "poll"): Promise<boolean> => {
  const token = method === "fcm" ? await fcmToken() : null;
  if (method === "fcm" && token === null) {
    return false;
  }
  try {
    const projectId = appFirebaseProject();
    await api.call(endpoints.notifications.push, {
      body:
        token === null
          ? { method: "poll" }
          : { endpoint: token, method: "fcm", ...(projectId !== null && { projectId }) },
    });
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === "push/method-unavailable") {
      return false;
    }
    throw error;
  }
};

/**
Tells the server how this phone gets system notifications, exactly one way: the method picked
in Settings (`pushStore`'s `choice`); automatic, Firebase when the server offers it and the
phone has a Google token, else polling (the open app fetches them). The pick is left for the
other only when it cannot be used (the server does not take it, no Google token), and kept for
the next time. `none` when picked, or without the notification permission. Run on every start
(a token may have changed), when the server says its methods changed and on a new pick.
*/
export const registerPush = async (api: ApiClient): Promise<PushMethod> => {
  const choice = asMethod(await readKey(CHOICE_KEY));
  const isAllowed = await hasPermission();
  const choose = async (): Promise<PushMethod> => {
    if (!isAllowed || choice === "none") {
      await api.call(endpoints.notifications.push, { body: { method: "none" } });
      return "none";
    }
    const pushMethods = usableMethods(await api.call(endpoints.notifications.pushMethods, {}));
    const order = choice === "poll" ? (["poll", "fcm"] as const) : (["fcm", "poll"] as const);
    for (const method of order) {
      if (pushMethods.includes(method) && (await isRegistered(api, method))) {
        return method;
      }
    }
    await api.call(endpoints.notifications.push, { body: { method: "none" } });
    return "none";
  };
  const method = await choose();
  await SecureStore.setItemAsync(METHOD_KEY, method);
  pushStore.setState({ choice, isAllowed, method });
  return method;
};
