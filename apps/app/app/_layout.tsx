import "../global.css";

import { Stack } from "expo-router";
import { ShareIntentProvider } from "expo-share-intent";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PaceProvider } from "#app/app-state.tsx";
import { ThemeProvider, useTheme } from "#app/ui/theme-provider.tsx";

const Navigator = () => {
  const { palette, scheme } = useTheme();
  return (
    <>
      <Stack screenOptions={{ contentStyle: { backgroundColor: palette.bg }, headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ animation: "fade" }} />
        <Stack.Screen name="auth" options={{ animation: "fade" }} />
        <Stack.Screen name="settings" options={{ presentation: "modal" }} />
        <Stack.Screen name="task/[id]" />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="inbox" />
        <Stack.Screen name="review" />
        <Stack.Screen name="history" />
      </Stack>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
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
              <Navigator />
            </ShareIntentProvider>
          </PaceProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
