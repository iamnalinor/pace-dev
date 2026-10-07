import "../global.css";

import { Stack } from "expo-router";
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
            <Navigator />
          </PaceProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
