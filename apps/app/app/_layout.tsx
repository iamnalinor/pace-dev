import "../global.css";

import { type ErrorBoundaryProps, Stack, usePathname } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PaceProvider, useAuth } from "#app/app-state.tsx";
import { GateProvider, isBarePath, NavigatorHold, RouteGate } from "#app/auth/route-gate.tsx";
import { useServerProblem } from "#app/features/server/configuration-notice.tsx";
import { IncompatibleGate, useIsServerBlocked } from "#app/features/server/incompatible-screen.tsx";
import { ServerSwitchGate } from "#app/features/server/server-switch-gate.tsx";
import { CrashDocumentLanguage } from "#app/platform/crash-document-language.tsx";
import { useCrashNotice } from "#app/platform/crash-notice.ts";
import { DocumentHead } from "#app/platform/document-head.tsx";
import { DocumentLanguage } from "#app/platform/document-language.tsx";
import { DocumentTheme } from "#app/platform/document-theme.tsx";
import { NotificationLinks } from "#app/platform/notification-links.ts";
import { OtaProvider } from "#app/platform/ota-provider.tsx";
import { UpdateBanner } from "#app/platform/update-banner.tsx";
// Defines the push task (and the foreground handler) before Android may run it.
import "#app/platform/push-task.ts";
import { useCrashContext } from "#app/platform/use-crash-context.ts";
import { CrashScreen } from "#app/screens/crash-screen.tsx";
import { Navigation } from "#app/ui/navigation.tsx";
import { sceneLayout } from "#app/ui/screen-scene.tsx";
import { useIsScrimUp } from "#app/ui/scrim.ts";
import { Shell } from "#app/ui/shell.tsx";
import { SyncFrame } from "#app/ui/sync-frame.tsx";
import { ThemeProvider, useTheme } from "#app/ui/theme-provider.tsx";
import { ToastProvider } from "#app/ui/toast.tsx";
import { TooltipHost } from "#app/ui/tooltip.tsx";
import { useBreakpoint } from "#app/ui/use-breakpoint.ts";
import { seedReducedMotion } from "#app/ui/use-reduced-motion.ts";

// Reduced motion is asked once, as the app starts, so the first overlay already plays the right
// preset (UI review I1).
void seedReducedMotion();

/**
Beside a tablet's or a computer's window the navigation (the rail, the sidebar) stays beside every
signed-in screen, pushed ones included; not beside the versions screen, which leaves only Log out.
A phone navigates by the tabs' bar instead.
*/
const useHasNavigation = (): boolean => {
  const breakpoint = useBreakpoint();
  const path = usePathname();
  const { status } = useAuth();
  const isBlocked = useIsServerBlocked();
  return breakpoint !== "compact" && status === "signed-in" && !isBlocked && !isBarePath(path);
};

/** Keeps what a crash file says about the app current; apart, so syncs do not redraw the Stack. */
const CrashContext = () => {
  useCrashContext(usePathname());
  return null;
};

/** The web page's theme and status bar follow the app; apart, so a sheet opening redraws only this. */
const AppDocumentTheme = () => {
  const { scheme } = useTheme();
  return <DocumentTheme isDimmed={useIsScrimUp()} scheme={scheme} />;
};

const Navigator = () => {
  const { palette, scheme } = useTheme();
  const hasNavigation = useHasNavigation();
  const path = usePathname();
  const serverProblem = useServerProblem();
  useCrashNotice();
  return (
    <ServerSwitchGate>
      <UpdateBanner>
        <SyncFrame isBare={isBarePath(path)} serverProblem={serverProblem}>
          <CrashContext />
          <DocumentLanguage />
          <DocumentHead />
          <AppDocumentTheme />
          <Shell
            content={
              <NavigatorHold>
                <Stack
                  // A signed-in app its server does not fit sees the versions screen instead of any
                  // route; the navigator stays mounted, so logging out lands on the login screen.
                  layout={({ children }) => (
                    <IncompatibleGate>
                      <RouteGate path={path}>
                        {/* Under the hold and the gate: a tap is followed once the Stack exists. */}
                        <NotificationLinks />
                        {children}
                      </RouteGate>
                    </IncompatibleGate>
                  )}
                  screenLayout={sceneLayout}
                  screenOptions={{
                    contentStyle: { backgroundColor: palette["bg.app"] },
                    headerShown: false,
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="login" options={{ animation: "fade" }} />
                  <Stack.Screen name="auth/index" options={{ animation: "fade" }} />
                  <Stack.Screen name="task/[id]" />
                  <Stack.Screen name="review" />
                  <Stack.Screen name="permissions" />
                  <Stack.Screen
                    name="onboarding"
                    options={{ animation: "fade", gestureEnabled: false }}
                  />
                </Stack>
              </NavigatorHold>
            }
            {...(hasNavigation && { navigation: <Navigation /> })}
          />
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        </SyncFrame>
      </UpdateBanner>
    </ServerSwitchGate>
  );
};

/**
Anything a screen throws lands here instead of blanking the app: what broke, and a way back.
Expo Router renders it in place of the layout's tree.
*/
export function ErrorBoundary({ error }: Readonly<ErrorBoundaryProps>) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <CrashDocumentLanguage />
        <CrashScreen error={error} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Gesture root → safe areas → theme variables → client runtime → the auth-gated stack. */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <OtaProvider>
            <PaceProvider>
              <ShareIntentProvider>
                <ToastProvider>
                  <TooltipHost>
                    <GateProvider>
                      <Navigator />
                    </GateProvider>
                  </TooltipHost>
                </ToastProvider>
              </ShareIntentProvider>
            </PaceProvider>
          </OtaProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
