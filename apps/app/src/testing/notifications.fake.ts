type Scheduled = {
  readonly identifier: string;
  readonly content: {
    readonly title?: string;
    readonly body?: string;
    readonly data?: unknown;
    readonly categoryIdentifier?: string;
  };
};

type Category = {
  readonly identifier: string;
  readonly buttonTitle: string;
  readonly options?: object;
};

type ResponseListener = (response: {
  readonly actionIdentifier: string;
  readonly notification: { readonly request: { readonly content: { readonly data?: unknown } } };
}) => void;

/** expo-notifications without the native module: a test sets what the phone answers. */
export const createFakeNotifications = () => {
  const state = {
    canAskAgain: true,
    granted: false,
    grantOnRequest: true,
    /** Everything scheduled (or presented) so far, newest last. */
    scheduled: [] as Scheduled[],
    /** Identifiers taken away with `dismissNotificationAsync`. */
    dismissed: [] as string[],
    categories: new Map<string, readonly Category[]>(),
    /** The FCM token the phone has; `null`: no Google services (the call fails). */
    pushToken: null as null | string,
    responseListeners: [] as ResponseListener[],
  };
  const permission = () => ({ canAskAgain: state.canAskAgain, granted: state.granted });
  return {
    AndroidImportance: { DEFAULT: 3, HIGH: 4 },
    BackgroundNotificationTaskResult: { Failed: 2, NewData: 0, NoData: 1 },
    DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
    SchedulableTriggerInputTypes: { DATE: "date" },
    addNotificationResponseReceivedListener: (listener: ResponseListener) => {
      state.responseListeners.push(listener);
      return {
        remove: () => {
          state.responseListeners = state.responseListeners.filter((item) => item !== listener);
        },
      };
    },
    cancelScheduledNotificationAsync: async (id: string): Promise<void> => {
      await Promise.resolve();
      state.scheduled = state.scheduled.filter((item) => item.identifier !== id);
    },
    dismissNotificationAsync: async (id: string): Promise<void> => {
      await Promise.resolve();
      state.dismissed = [...state.dismissed, id];
    },
    getAllScheduledNotificationsAsync: async (): Promise<readonly Scheduled[]> => [
      ...state.scheduled,
    ],
    getDevicePushTokenAsync: async (): Promise<{
      readonly data: string;
      readonly type: string;
    }> => {
      await Promise.resolve();
      if (state.pushToken === null) {
        throw new Error("No Google Play services");
      }
      return { data: state.pushToken, type: "android" };
    },
    getLastNotificationResponse: () => null,
    getPermissionsAsync: async () => permission(),
    registerTaskAsync: async (): Promise<null> => null,
    requestPermissionsAsync: async () => {
      state.granted = state.grantOnRequest;
      state.canAskAgain = state.grantOnRequest;
      return permission();
    },
    scheduleNotificationAsync: async (request: Scheduled): Promise<string> => {
      state.scheduled = [...state.scheduled, request];
      return request.identifier;
    },
    setNotificationCategoryAsync: async (identifier: string, actions: readonly Category[]) => {
      await Promise.resolve();
      state.categories.set(identifier, actions);
      return null;
    },
    setNotificationChannelAsync: async (): Promise<null> => null,
    setNotificationHandler: (): void => undefined,
    state,
  };
};
