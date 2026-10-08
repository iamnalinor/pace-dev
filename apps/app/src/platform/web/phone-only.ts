/*
The phone-only Expo modules on the web build (swapped in by metro.config.js): notifications,
the calendar, background tasks. Nothing is granted and nothing is scheduled; the screens hide
what needs a phone.
*/

const denied = { canAskAgain: false, expires: "never", granted: false, status: "denied" } as const;

const none = async (): Promise<void> => {
  await Promise.resolve();
};

// expo-notifications
export const AndroidImportance = { DEFAULT: 3, HIGH: 4, LOW: 2, MAX: 5, MIN: 1 } as const;
export const SchedulableTriggerInputTypes = {
  DATE: "date",
  TIME_INTERVAL: "timeInterval",
} as const;
export const DEFAULT_ACTION_IDENTIFIER = "expo.modules.notifications.actions.DEFAULT";
const deny = (): Promise<typeof denied> => Promise.resolve(denied);
const nothing = (): Promise<readonly never[]> => Promise.resolve([]);

export const getPermissionsAsync = deny;
export const requestPermissionsAsync = deny;
export const scheduleNotificationAsync = (): Promise<string> => Promise.resolve("");
export const cancelScheduledNotificationAsync = none;
export const getAllScheduledNotificationsAsync = nothing;
export const setNotificationChannelAsync = none;
export const setNotificationHandler = (): void => undefined;
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the name expo-notifications exports
export const useLastNotificationResponse = (): null => null;

// expo-calendar
export const EntityTypes = { EVENT: "event", REMINDER: "reminder" } as const;
export const getCalendarPermissions = deny;
export const requestCalendarPermissions = deny;
export const getCalendars = nothing;
export const listEvents = nothing;

// expo-task-manager, expo-background-task
export const defineTask = (): void => undefined;
export const isTaskRegisteredAsync = async (): Promise<boolean> => {
  await Promise.resolve();
  return false;
};
export const BackgroundTaskResult = { Failed: 2, Success: 1 } as const;
export const BackgroundTaskStatus = { Available: 2, Restricted: 1 } as const;
export const getStatusAsync = (): Promise<number> =>
  Promise.resolve(BackgroundTaskStatus.Restricted);
export const registerTaskAsync = none;
export const unregisterTaskAsync = none;
