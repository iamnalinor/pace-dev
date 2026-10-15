import * as Notifications from "expo-notifications";

import { notificationIdOf } from "./notification-id.ts";
import { dismissPoolNotification } from "./notifications.ts";
import { sessionHashOf } from "./session-fingerprint.ts";

/** On logout, remove this app's pool copies from the Android tray, leaving other notices alone. */
export const clearPresentedPoolNotifications = async (session: string): Promise<void> => {
  try {
    const hash = await sessionHashOf(session);
    const shown = await Notifications.getPresentedNotificationsAsync();
    for (const item of shown) {
      const data = item.request.content.data;
      if (
        data !== undefined &&
        notificationIdOf(data) !== null &&
        (data["sessionHash"] === undefined || data["sessionHash"] === hash)
      ) {
        await dismissPoolNotification(item.request.identifier);
      }
    }
  } catch {
    // The tray may be unavailable while Android is tearing down the signed-out process.
  }
};
