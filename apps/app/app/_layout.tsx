import "../global.css";

import { type ErrorBoundaryProps, Stack, usePathname } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PaceProvider, useAuth } from "#app/app-state.tsx";
import { isBarePath, RouteGate } from "#app/auth/route-gate.tsx";
import { CrashDocumentLanguage } from "#app/platform/crash-document-language.tsx";
import { useCrashNotice } from "#app/platform/crash-notice.ts";
import { DocumentLanguage } from "#app/platform/document-language.tsx";
import { useNotificationLinks } from "#app/platform/notification-links.ts";
import { UpdateBanner } from "#app/platform/update-banner.tsx";
// Defines the push task (and the foreground handler) before Android may run it.
import "#app/platform/push-task.ts";
import { useCrashContext } from "#app/platform/use-crash-context.ts";
import { CrashScreen } from "#app/screens/crash-screen.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { ScreenScene } from "#app/ui/screen-scene.tsx";
import { Sidebar } from "#app/ui/sidebar.tsx";
import { ThemeProvider, useTheme } from "#app/ui/theme-provider.tsx";
import { ToastProvider } from "#app/ui/toast.tsx";
import { TooltipHost } from "#app/ui/tooltip.tsx";

/** On a wide window the sidebar stays beside every signed-in screen, pushed ones included. */
const useHasSidebar = (): boolean => {
  const isWide = useIsWide();
  const path = usePathname();
  const { status } = useAuth();
  return isWide && status === "signed-in" && !isBarePath(path);
};

/** Keeps what a crash file says about the app current; apart, so syncs do not redraw the Stack. */
const CrashContext = () => {
  useCrashContext(usePathname());
  return null;
};

const Navigator = () => {
  const { palette, scheme } = useTheme();
  const hasSidebar = useHasSidebar();
  const path = usePathname();
  useNotificationLinks();
  useCrashNotice();
  return (
    <UpdateBanner>
      <View className="flex-1 flex-row bg-bg">
        <CrashContext />
        <DocumentLanguage />
        {hasSidebar ? <Sidebar /> : null}
        <View className="flex-1">
          <Stack
            layout={({ children }) => <RouteGate path={path}>{children}</RouteGate>}
            screenLayout={({ children }) => <ScreenScene>{children}</ScreenScene>}
            screenOptions={{ contentStyle: { backgroundColor: palette.bg }, headerShown: false }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ animation: "fade" }} />
            <Stack.Screen name="auth/index" options={{ animation: "fade" }} />
            <Stack.Screen name="task/[id]" />
            <Stack.Screen name="project/[id]" />
            <Stack.Screen name="projects" />
            <Stack.Screen name="week" />
            <Stack.Screen name="insights" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="review" />
            <Stack.Screen name="history" />
            <Stack.Screen name="permissions" />
            <Stack.Screen name="devices" />
            <Stack.Screen name="notifications" />
            <Stack.Screen
              name="onboarding"
              options={{ animation: "fade", gestureEnabled: false }}
            />
          </Stack>
        </View>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </View>
    </UpdateBanner>
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
          <PaceProvider>
            <ShareIntentProvider>
              <ToastProvider>
                <TooltipHost>
                  <Navigator />
                </TooltipHost>
              </ToastProvider>
            </ShareIntentProvider>
          </PaceProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
