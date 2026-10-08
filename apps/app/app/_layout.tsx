import "../global.css";

import { Stack } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PaceProvider } from "#app/app-state.tsx";
import { useNotificationLinks } from "#app/platform/notification-links.ts";
// Defines the background phone check before Android may run it.
import "#app/platform/phone-background.ts";
import { UpdateBanner } from "#app/platform/update-banner.tsx";
import { ThemeProvider, useTheme } from "#app/ui/theme-provider.tsx";
import { ToastProvider } from "#app/ui/toast.tsx";

const Navigator = () => {
  const { palette, scheme } = useTheme();
  useNotificationLinks();
  return (
    <>
      <Stack screenOptions={{ contentStyle: { backgroundColor: palette.bg }, headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ animation: "fade" }} />
        <Stack.Screen name="auth/index" options={{ animation: "fade" }} />
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
        <Stack.Screen name="task/[id]" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="review" />
        <Stack.Screen name="history" />
        <Stack.Screen name="permissions" />
        <Stack.Screen name="onboarding" options={{ animation: "fade", gestureEnabled: false }} />
      </Stack>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <UpdateBanner />
    </>
  );
};

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
