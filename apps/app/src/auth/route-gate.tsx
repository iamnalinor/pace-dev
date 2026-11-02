import { Redirect } from "expo-router";
import { createContext, type ReactNode, use, useState } from "react";
import { View } from "react-native";

import { useAuth } from "#app/app-state.tsx";
import { useOnboarded } from "#app/features/permissions/use-onboarded.ts";

/** Screens without the app's navigation or a session: signing in and the first-run walk-through. */
export const BARE_PATHS = ["/login", "/auth", "/app/auth", "/app/login", "/onboarding", "/oauth"];

/** Whether a path is one of the screens that need no session (a whole segment: not "/authors"). */
export const isBarePath = (path: string): boolean =>
  BARE_PATHS.some((bare) => path === bare || path.startsWith(`${bare}/`));

/** Whether this phone went through the walk-through, read once for the whole app (`null` while read). */
const OnboardedContext = createContext<boolean | null>(null);

/** Reads the walk-through mark once, above the navigator, for `NavigatorHold` and `RouteGate`. */
export const GateProvider = ({ children }: { readonly children: ReactNode }) => (
  <OnboardedContext value={useOnboarded()}>{children}</OnboardedContext>
);

/** What the gate decides on: the session and, signed in, the walk-through mark; `null` while read. */
const useGate = (): {
  readonly isOnboarded: boolean | null;
  readonly isRead: boolean;
  readonly status: ReturnType<typeof useAuth>["status"];
} => {
  const { status } = useAuth();
  const isOnboarded = use(OnboardedContext);
  const isRead = status !== "loading" && (status !== "signed-in" || isOnboarded !== null);
  return { isOnboarded, isRead, status };
};

/** A blank page of the app's own background, so nothing flashes while the gate is read. */
const Blank = () => <View className="flex-1 bg-bg" />;

/**
Holds the navigator back until the gate knows where to go, then never again. Mounted any later
(behind a blank gate), a nested navigator such as the tabs would take the route from the address
too late: in between, the address bar was rewritten to `/` and a reload of Day or Inbox landed
on Now (QA round 17 M2). Mounted only now, every navigator down to the screen mounts at once.
*/
export const NavigatorHold = ({ children }: { readonly children: ReactNode }) => {
  const { isRead } = useGate();
  const [hasBeenRead, setHasBeenRead] = useState(isRead);
  if (isRead && !hasBeenRead) {
    setHasBeenRead(true);
  }
  return hasBeenRead || isRead ? <>{children}</> : <Blank />;
};

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
  const { isOnboarded, isRead, status } = useGate();
  if (isBarePath(path)) {
    return <>{children}</>;
  }
  if (!isRead) {
    return <Blank />;
  }
  if (status === "signed-out") {
    return <Redirect href="/login" />;
  }
  return isOnboarded === false ? <Redirect href="/onboarding" /> : <>{children}</>;
};
