import * as Notifications from "expo-notifications";

import {
  fetchNotificationPlan,
  localNotifications,
  type PaceClient,
  scheduleChanges,
} from "@pace/client";
import { t } from "@pace/core";

/** The Android channel the reminders go to (users can silence it in system settings). */
const CHANNEL_ID = "reminders";

/** Asks once; a refusal is respected (no reminders, nothing else changes). */
const hasPermission = async (): Promise<boolean> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) {
    return current.granted;
  }
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
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
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const changes = scheduleChanges(
    scheduled.map((request) => request.identifier),
    localNotifications(plan, language),
  );
  for (const id of changes.cancel) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
  for (const item of changes.schedule) {
    await Notifications.scheduleNotificationAsync({
      content: { body: item.body, title: item.title },
      identifier: item.id,
      trigger: {
        channelId: CHANNEL_ID,
        date: new Date(item.at),
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      },
    });
  }
};
