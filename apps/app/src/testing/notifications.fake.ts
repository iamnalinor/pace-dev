type Scheduled = {
  readonly identifier: string;
  readonly content: { readonly title?: string; readonly body?: string; readonly data?: unknown };
};

/** expo-notifications without the native module: a test sets what the phone answers. */
export const createFakeNotifications = () => {
  const state = {
    canAskAgain: true,
    granted: false,
    grantOnRequest: true,
    /** Everything scheduled (or presented) so far, newest last. */
    scheduled: [] as Scheduled[],
  };
  const permission = () => ({ canAskAgain: state.canAskAgain, granted: state.granted });
  return {
    AndroidImportance: { DEFAULT: 3 },
    SchedulableTriggerInputTypes: { DATE: "date" },
    addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
    cancelScheduledNotificationAsync: async (id: string): Promise<void> => {
      await Promise.resolve();
      state.scheduled = state.scheduled.filter((item) => item.identifier !== id);
    },
    getAllScheduledNotificationsAsync: async (): Promise<readonly Scheduled[]> => [
      ...state.scheduled,
    ],
    getLastNotificationResponse: () => null,
    getPermissionsAsync: async () => permission(),
    requestPermissionsAsync: async () => {
      state.granted = state.grantOnRequest;
      state.canAskAgain = state.grantOnRequest;
      return permission();
    },
    scheduleNotificationAsync: async (request: Scheduled): Promise<string> => {
      state.scheduled = [...state.scheduled, request];
      return request.identifier;
    },
    setNotificationChannelAsync: async (): Promise<null> => null,
    state,
  };
};
