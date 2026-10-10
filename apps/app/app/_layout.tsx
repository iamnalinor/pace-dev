import "../global.css";

import { type ErrorBoundaryProps, Stack, usePathname } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PaceProvider, useAuth } from "#app/app-state.tsx";
import { useNotificationLinks } from "#app/platform/notification-links.ts";
// Defines the background phone check before Android may run it.
import "#app/platform/phone-background.ts";
import { UpdateBanner } from "#app/platform/update-banner.tsx";
import { CrashScreen } from "#app/screens/crash-screen.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { Sidebar } from "#app/ui/sidebar.tsx";
import { ThemeProvider, useTheme } from "#app/ui/theme-provider.tsx";
import { ToastProvider } from "#app/ui/toast.tsx";

/** Screens without the app's navigation: signing in and the first-run walk-through. */
const BARE_PATHS = ["/login", "/auth", "/app/auth", "/onboarding", "/oauth"];

/** On a wide window the sidebar stays beside every signed-in screen, pushed ones included. */
const useHasSidebar = (): boolean => {
  const isWide = useIsWide();
  const path = usePathname();
  const { status } = useAuth();
  return isWide && status === "signed-in" && BARE_PATHS.every((bare) => !path.startsWith(bare));
};

const Navigator = () => {
  const { palette, scheme } = useTheme();
  const hasSidebar = useHasSidebar();
  const isWide = useIsWide();
  useNotificationLinks();
  return (
    <View className="flex-1 flex-row bg-bg">
      {hasSidebar ? <Sidebar /> : null}
      <View className="flex-1">
        <Stack
          screenOptions={{ contentStyle: { backgroundColor: palette.bg }, headerShown: false }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" options={{ animation: "fade" }} />
          <Stack.Screen name="auth/index" options={{ animation: "fade" }} />
          <Stack.Screen name="settings" options={{ presentation: isWide ? "card" : "modal" }} />
          <Stack.Screen name="task/[id]" />
          <Stack.Screen name="project/[id]" />
          <Stack.Screen name="inbox" />
          <Stack.Screen name="review" />
          <Stack.Screen name="history" />
          <Stack.Screen name="permissions" />
          <Stack.Screen name="devices" />
          <Stack.Screen name="week" />
          <Stack.Screen name="onboarding" options={{ animation: "fade", gestureEnabled: false }} />
        </Stack>
      </View>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <UpdateBanner />
    </View>
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
                <Navigator />
              </ToastProvider>
            </ShareIntentProvider>
          </PaceProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
