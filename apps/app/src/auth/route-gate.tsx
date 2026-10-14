import type { ReactNode } from "react";

import { Redirect } from "expo-router";
import { View } from "react-native";

import { useAuth } from "#app/app-state.tsx";
import { useOnboarded } from "#app/features/permissions/use-onboarded.ts";

/** Screens without the app's navigation or a session: signing in and the first-run walk-through. */
export const BARE_PATHS = ["/login", "/auth", "/app/auth", "/app/login", "/onboarding", "/oauth"];

/** Whether a path is one of the screens that need no session (a whole segment: not "/authors"). */
export const isBarePath = (path: string): boolean =>
  BARE_PATHS.some((bare) => path === bare || path.startsWith(`${bare}/`));

/**
The one guard of every signed-in screen, whichever navigator it sits in (the tabs or a stack
route such as Settings): without a session a deep link goes to the login screen, and a phone that
has not seen the permissions walk-through goes there first. Nothing is shown while that is read.
*/
export const RouteGate = ({
  children,
  path,
}: {
  readonly children: ReactNode;
  readonly path: string;
}) => {
  const { status } = useAuth();
  const isOnboarded = useOnboarded();
  if (isBarePath(path)) {
    return <>{children}</>;
  }
  if (status === "loading" || (status === "signed-in" && isOnboarded === null)) {
    // A blank page of the app's own background, so nothing flashes while the session is read.
    return <View className="flex-1 bg-bg" />;
  }
  if (status === "signed-out") {
    return <Redirect href="/login" />;
  }
  return isOnboarded === false ? <Redirect href="/onboarding" /> : <>{children}</>;
};
