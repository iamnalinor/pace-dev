import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { createStore } from "zustand/vanilla";

import {
  eligibleMethods,
  type FcmIneligibilityReason,
  type MethodsAnswer,
  pushAuthority,
} from "#app/platform/push-eligibility.ts";
import { createPushQueue } from "#app/platform/push-queue.ts";
import { secureSave } from "#app/platform/shown-then-saved.ts";
import { type ApiClient, ApiError } from "@pace/client";
import { endpoints } from "@pace/core";

/** How this phone gets the pool's notifications as system ones (see `registerPush`). */
export type PushMethod = "fcm" | "none" | "poll";

const METHOD_KEY = "pace.push.method";
/** The method picked in Settings; absent: automatic (Google's push when there is one). */
const CHOICE_KEY = "pace.push.choice";

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
  readonly fcmIneligibilityReason: FcmIneligibilityReason;
};

/**
This phone's push state, for Settings to follow as it changes (registered again, picked, the
server's methods changed).
*/
export const pushStore = createStore<PushState>(() => ({
  choice: null,
  isAllowed: true,
  isFcmOtherProject: false,
  fcmIneligibilityReason: null,
  method: null,
  offered: null,
}));

/**
Whether to ask for the battery-optimization exemption: only while the phone checks in the
background itself. Google's push wakes the phone on its own, and with none there is nothing to
fetch (owner rule). The one decision the walk-through, Settings → Permissions and the hint under
the picker read (bug class 1).
*/
export const isBackgroundStepNeeded = ({ method }: Pick<PushState, "method">) => method === "poll";

const deviceServices = { failure: null as null | ReturnType<typeof pushAuthority> };

const publishMethods = (usable: ReturnType<typeof eligibleMethods>): void => {
  const hasDeviceFailure = deviceServices.failure?.isCurrent() === true;
  pushStore.setState({
    ...usable,
    offered: hasDeviceFailure
      ? usable.offered.filter((method) => method !== "fcm")
      : usable.offered,
    fcmIneligibilityReason:
      usable.fcmIneligibilityReason ?? (hasDeviceFailure ? "services-unavailable" : null),
  });
};

/** Offline, the methods offered last stay visible. Old-origin answers never publish. */
export const loadOfferedMethods = async (api: ApiClient, origin?: string): Promise<void> => {
  const authority = pushAuthority(origin);
  try {
    const answer = await api.call(endpoints.notifications.pushMethods, {});
    if (authority.isCurrent()) {
      publishMethods(eligibleMethods(answer, authority));
    }
  } catch {
    // Offline: keep the last known methods.
  }
};

/** Reads what was stored into `pushStore` (Settings opened before this start registered). */
export const loadPushState = async (): Promise<void> => {
  const { generation } = choices;
  const [method, choice] = [await readKey(METHOD_KEY), await readKey(CHOICE_KEY)];
  pushStore.setState((state) => ({
    choice: generation === choices.generation ? asMethod(choice) : state.choice,
    method: state.method ?? asMethod(method),
  }));
};

/** Picks how this phone shows notifications (`null`: automatic); `registerPush` honours it. */
export const setPushChoice = async (
  choice: null | PushMethod,
): Promise<{ readonly isLatest: boolean }> => {
  choices.generation += 1;
  registrations.generation += 1;
  const { generation } = choices;
  pushStore.setState({ choice });
  try {
    await saveChoiceInOrder(async () => {
      await secureSave(CHOICE_KEY, choice);
    });
  } catch (error) {
    const stored = asMethod(await readKey(CHOICE_KEY));
    if (generation === choices.generation) {
      pushStore.setState({ choice: stored });
    }
    throw error;
  }
  return { isLatest: generation === choices.generation };
};

type RegistrationAuthority = ReturnType<typeof pushAuthority> & {
  readonly credential: string | undefined;
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

const registrationBody = async (method: "fcm" | "poll", authority: RegistrationAuthority) => {
  const endpoint = method === "fcm" ? await fcmToken() : null;
  if (!authority.isCurrent()) {
    return null;
  }
  if (method === "poll") {
    return { method } as const;
  }
  if (endpoint === null) {
    deviceServices.failure = { ...authority, isCurrent: authority.isConfigurationCurrent };
    pushStore.setState((state) => ({
      fcmIneligibilityReason: "services-unavailable",
      offered: state.offered?.filter((offered) => offered !== "fcm") ?? null,
    }));
    return null;
  }
  deviceServices.failure = null;
  const { projectId } = authority;
  return { endpoint, method, ...(projectId !== null && { projectId }) } as const;
};

/** Registers one method; false when unavailable or authority expired. */
const isRegistered = async (
  api: ApiClient,
  method: "fcm" | "poll",
  authority: RegistrationAuthority,
): Promise<boolean> => {
  const body = await registrationBody(method, authority);
  if (body === null || !authority.isCurrent()) {
    return false;
  }
  try {
    await sendSubscription({ api, authority }, body);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === "push/method-unavailable") {
      return false;
    }
    throw error;
  }
};

type Registration = {
  readonly api: ApiClient;
  readonly authority: RegistrationAuthority;
  readonly choice: null | PushMethod;
  readonly isAllowed: boolean;
};

const firstRegistered = async (
  { api, authority, choice }: Registration,
  offered: readonly ("fcm" | "poll")[],
): Promise<null | PushMethod> => {
  const order = choice === "poll" ? (["poll", "fcm"] as const) : (["fcm", "poll"] as const);
  for (const method of order) {
    if (!authority.isCurrent()) {
      return null;
    }
    if (offered.includes(method) && (await isRegistered(api, method, authority))) {
      return method;
    }
  }
  return null;
};

const refreshAfterRegistration = (
  method: PushMethod,
  usable: ReturnType<typeof eligibleMethods>,
  authority: RegistrationAuthority,
): PushMethod => {
  if (authority.isCurrent()) {
    publishMethods(usable);
  }
  return method;
};

const chooseRegistration = async ({
  api,
  authority,
  choice,
  isAllowed,
}: Registration): Promise<PushMethod> => {
  if (!authority.isCurrent()) {
    return "none";
  }
  if (!isAllowed || choice === "none") {
    await sendSubscription({ api, authority }, { method: "none" });
    return "none";
  }
  const answer: MethodsAnswer = await api.call(endpoints.notifications.pushMethods, {});
  if (!authority.isCurrent()) {
    return "none";
  }
  const usable = eligibleMethods(answer, authority);
  publishMethods(usable);
  const registered = await firstRegistered({ api, authority, choice, isAllowed }, usable.offered);
  if (registered !== null) {
    return refreshAfterRegistration(registered, usable, authority);
  }
  await sendSubscription({ api, authority }, { method: "none" });
  return "none";
};

const saveChoiceInOrder = createPushQueue();
const choices = { generation: 0 };
const persistInOrder = createPushQueue();
const subscribeInOrder = createPushQueue();
const registrations = { generation: 0 };

type SubscriptionBody =
  | { readonly method: "fcm"; readonly endpoint: string; readonly projectId?: string }
  | { readonly method: "none" | "poll" };

const sendSubscription = async (
  { api, authority }: Pick<Registration, "api" | "authority">,
  body: SubscriptionBody,
): Promise<void> => {
  const { credential } = authority;
  if (credential === undefined) {
    return;
  }
  await subscribeInOrder(async () => {
    if (authority.isCurrent()) {
      await api.call(endpoints.notifications.push, { body }, { credential });
    }
  });
};

/** Serialize native writes so the newest method is durable after older writes finish. */
const persistMethod = async (
  method: PushMethod,
  authority: RegistrationAuthority,
): Promise<void> => {
  await persistInOrder(async () => {
    if (authority.isCurrent()) {
      await SecureStore.setItemAsync(METHOD_KEY, method);
    }
  });
};

/**
Tells the server how this phone gets system notifications, exactly one way: the method picked
in Settings (`pushStore`'s `choice`); automatic, Firebase when the server offers it and the
phone has a Google token, else polling (the open app fetches them). The pick is left for the
other only when it cannot be used (the server does not take it, no Google token), and kept for
the next time. `none` when picked, or without the notification permission. Run on every start
(a token may have changed), when the server says its methods changed and on a new pick.
*/
const captureRegistration = (api: ApiClient, origin?: string): RegistrationAuthority => {
  registrations.generation += 1;
  const { generation } = registrations;
  const captured = pushAuthority(origin);
  const session = api.currentSessionToken();
  return {
    ...captured,
    credential: session,
    isCurrent: () =>
      registrations.generation === generation &&
      captured.isCurrent() &&
      api.currentSessionToken() === session,
  };
};

export const registerPush = async (api: ApiClient, origin?: string): Promise<PushMethod> => {
  const authority = captureRegistration(api, origin);
  if (authority.credential === undefined) {
    return "none";
  }
  const choice = asMethod(await readKey(CHOICE_KEY));
  const isAllowed = await hasPermission();
  const method = await chooseRegistration({ api, authority, choice, isAllowed });
  if (!authority.isCurrent()) {
    return method;
  }
  await persistMethod(method, authority);
  if (authority.isCurrent()) {
    pushStore.setState({ choice, isAllowed, method });
  }
  return method;
};
