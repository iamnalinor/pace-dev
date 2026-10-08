/** expo-notifications without the native module: nothing is granted, nothing is scheduled. */
export const createFakeNotifications = () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  cancelScheduledNotificationAsync: async (): Promise<void> => {
    await Promise.resolve();
  },
  getAllScheduledNotificationsAsync: async (): Promise<readonly { identifier: string }[]> => [],
  getPermissionsAsync: async () => ({ canAskAgain: false, granted: false }),
  requestPermissionsAsync: async () => ({ canAskAgain: false, granted: false }),
  scheduleNotificationAsync: async (): Promise<string> => "",
  setNotificationChannelAsync: async (): Promise<null> => null,
});
