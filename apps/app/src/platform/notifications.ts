import * as Notifications from "expo-notifications";

import {
  activityNotifications,
  fetchNotificationPlan,
  isActivityId,
  type LocalNotification,
  localNotifications,
  type PaceClient,
  scheduleChanges,
  timeBarModel,
} from "@pace/client";
import { t } from "@pace/core";

/** The Android channel the reminders go to (users can silence it in system settings). */
const CHANNEL_ID = "reminders";

/** Activity timers: louder than reminders, since they are about the thing being done now. */
const TIMERS_CHANNEL_ID = "timers";

/** Asks once; a refusal is respected (no reminders, nothing else changes). */
const hasPermission = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) {
    return current.granted;
  }
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
};

/** Cancels what this sync owns but no longer wants and schedules what is missing. */
const apply = async (
  wanted: readonly LocalNotification[],
  {
    channelId,
    isOwned,
  }: { readonly channelId: string; readonly isOwned?: (id: string) => boolean },
): Promise<void> => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const changes = scheduleChanges(
    scheduled.map((request) => request.identifier),
    wanted,
    isOwned,
  );
  for (const id of changes.cancel) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
  for (const item of changes.schedule) {
    await Notifications.scheduleNotificationAsync({
      content: { body: item.body, title: item.title },
      identifier: item.id,
      trigger: {
        channelId,
        date: new Date(item.at),
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
    });
  }
};

/**
Mirrors the server's notification plan (`GET /api/notify/plan`) into local reminders: the
digest windows and the moments open tasks enter their critical window. The phone has no
rules of its own; offline, the reminders already scheduled stay.
*/
export const syncLocalNotifications = async (
  client: Pick<PaceClient, "api" | "state">,
): Promise<void> => {
  const plan = await fetchNotificationPlan(client.api);
  if (plan === null || !(await hasPermission())) {
    return;
  }
  const { language } = client.state.store.getState().settings;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    importance: Notifications.AndroidImportance.DEFAULT,
    name: t(language, "notify.channel"),
  });
  await apply(localNotifications(plan, language), { channelId: CHANNEL_ID });
};

/**
Keeps the running activity's Expect and Limit timers on the phone, so they ring without the
network; called whenever the running activity or its targets change.
*/
export const syncActivityTimers = async (
  client: Pick<PaceClient, "clock" | "state">,
): Promise<void> => {
  const state = client.state.store.getState();
  const now = client.clock.now();
  const { running } = timeBarModel(state, { deviceTz: client.clock.deviceTz, now });
  const wanted = activityNotifications(running, now, state.settings.language);
  if (wanted.length > 0 && !(await hasPermission())) {
    return;
  }
  await Notifications.setNotificationChannelAsync(TIMERS_CHANNEL_ID, {
    importance: Notifications.AndroidImportance.HIGH,
    name: t(state.settings.language, "notify.timersChannel"),
  });
  await apply(wanted, { channelId: TIMERS_CHANNEL_ID, isOwned: isActivityId });
};
