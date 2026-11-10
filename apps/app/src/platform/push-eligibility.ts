import { appFirebaseProject } from "#app/platform/firebase-project.ts";
import {
  type FirebaseBlockReason,
  firebaseRuntimeStore,
  isRuntimeFirebase,
} from "#app/platform/firebase-runtime.ts";
import { serverStore } from "#app/platform/server-store.ts";

export type FcmIneligibilityReason =
  | "configuration-pending"
  | "other-project"
  | "services-unavailable"
  | Exclude<FirebaseBlockReason, null>
  | null;
export type MethodsAnswer = {
  readonly pushMethods: readonly ("fcm" | "poll")[];
  readonly fcmProject: null | string;
};

/** Capture native authority before any asynchronous token work. */
export const pushAuthority = (origin?: string) => {
  const isRuntime = isRuntimeFirebase();
  const native = firebaseRuntimeStore.getState();
  const selectedOrigin = origin ?? serverStore.getState().origin;
  const isCurrent = (): boolean =>
    !isRuntime ||
    (serverStore.getState().origin === selectedOrigin &&
      firebaseRuntimeStore.getState() === native);
  const projectId = isRuntime ? native.projectId : appFirebaseProject();
  const isReady =
    origin !== undefined &&
    native.origin === origin &&
    native.status === "ready" &&
    projectId !== null &&
    isCurrent();
  const pendingReason = isReady ? null : "configuration-pending";
  const reason: FcmIneligibilityReason = isRuntime ? (native.blockReason ?? pendingReason) : null;
  const isConfigurationCurrent = (): boolean =>
    serverStore.getState().origin === selectedOrigin &&
    (!isRuntime || firebaseRuntimeStore.getState() === native);
  return { isCurrent, isConfigurationCurrent, projectId, runtime: isRuntime, reason };
};

export const eligibleMethods = (
  answer: MethodsAnswer,
  authority: ReturnType<typeof pushAuthority>,
) => {
  const isFcmOtherProject =
    authority.projectId !== null &&
    answer.fcmProject !== null &&
    authority.projectId !== answer.fcmProject;
  const fcmIneligibilityReason: FcmIneligibilityReason =
    authority.reason ??
    (isFcmOtherProject ? "other-project" : null) ??
    (authority.runtime && answer.fcmProject === null ? "configuration-pending" : null);
  const offered = answer.pushMethods.filter(
    (method) => method !== "fcm" || fcmIneligibilityReason === null,
  );
  return { offered, fcmIneligibilityReason };
};
