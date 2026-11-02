import { useLayoutEffect, useState } from "react";

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

type Response = {
  readonly actionIdentifier: string;
  readonly notification: {
    readonly request: {
      readonly content: { readonly data?: unknown };
      readonly identifier: string;
    };
  };
};

type ResponseListener = (response: Response) => void;

/**
The module's `determineNextResponse`: no tap is `null`; a tap replaces the one held only when it
comes from another notification (so the same one delivered again keeps the response object).
*/
const nextResponse = (
  previous: null | Response | undefined,
  next: null | Response,
): null | Response => {
  if (next === null) {
    return null;
  }
  if (previous === null || previous === undefined) {
    return next;
  }
  return previous.notification.request.identifier === next.notification.request.identifier
    ? previous
    : next;
};

/** expo-notifications without the native module: a test sets what the phone answers. */
export const createFakeNotifications = () => {
  const state = {
    canAskAgain: true,
    granted: false,
    grantOnRequest: true,
    /** Everything scheduled (or presented) so far, newest last. */
    scheduled: [] as Scheduled[],
    scheduleGate: null as null | Promise<boolean>,
    scheduleStarted: null as (() => void) | null,
    /** Identifiers taken away with `dismissNotificationAsync`. */
    dismissed: [] as string[],
    categories: new Map<string, readonly Category[]>(),
    /** The FCM token the phone has; `null`: no Google services (the call fails). */
    pushToken: null as null | string,
    responseListeners: [] as ResponseListener[],
    /** The tap the app was opened with (a cold start from a notification); `null`: none. */
    lastResponse: null as null | Response,
    /** Hooks told when the last tap is cleared, as the module's own emitter tells them. */
    clearListeners: [] as (() => void)[],
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
    /** As the module's: the phone forgets the last tap, and every hook reading it turns `null`. */
    clearLastNotificationResponse: (): void => {
      state.lastResponse = null;
      for (const listener of state.clearListeners) {
        listener();
      }
    },
    dismissNotificationAsync: async (id: string): Promise<void> => {
      await Promise.resolve();
      state.dismissed = [...state.dismissed, id];
    },
    getAllScheduledNotificationsAsync: async (): Promise<readonly Scheduled[]> => [
      ...state.scheduled,
    ],
    getPresentedNotificationsAsync: async () => state.scheduled.map((item) => ({ request: item })),
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
    getLastNotificationResponse: (): null | Response => state.lastResponse,
    getPermissionsAsync: async () => permission(),
    registerTaskAsync: async (): Promise<null> => null,
    requestPermissionsAsync: async () => {
      state.granted = state.grantOnRequest;
      state.canAskAgain = state.grantOnRequest;
      return permission();
    },
    scheduleNotificationAsync: async (request: Scheduled): Promise<string> => {
      state.scheduleStarted?.();
      await state.scheduleGate;
      state.scheduled = [...state.scheduled, request];
      return request.identifier;
    },
    setNotificationCategoryAsync: async (identifier: string, actions: readonly Category[]) => {
      await Promise.resolve();
      state.categories.set(identifier, actions);
      return null;
    },
    /**
    A tap while the app runs (warm): the phone keeps it as the last response and the module tells
    every response listener, as its emitter does.
    */
    respond: (response: Response): void => {
      state.lastResponse = response;
      for (const listener of state.responseListeners) {
        listener(response);
      }
    },
    setNotificationChannelAsync: async (): Promise<null> => null,
    setNotificationHandler: (): void => undefined,
    state,
    /**
    As the module's own (expo-notifications 57): `undefined` on the first render, the phone's last
    tap read on every mount in a layout effect, each tap while mounted taken through the response
    listener (the same notification again keeps the response it has), and `null` once cleared.
    */
    useLastNotificationResponse: (): null | Response | undefined => {
      const [response, setResponse] = useState<null | Response | undefined>(undefined);
      useLayoutEffect(() => {
        // eslint-disable-next-line @eslint-react/set-state-in-effect -- mirrors expo-notifications' own hook, which sets the launch tap in a layout effect
        setResponse((previous) => nextResponse(previous, state.lastResponse));
        const received: ResponseListener = (tap) => {
          setResponse((previous) => nextResponse(previous, tap));
        };
        const cleared = () => {
          setResponse(null);
        };
        state.responseListeners.push(received);
        state.clearListeners.push(cleared);
        return () => {
          state.responseListeners = state.responseListeners.filter((item) => item !== received);
          state.clearListeners = state.clearListeners.filter((item) => item !== cleared);
        };
      }, []);
      return response;
    },
  };
};
