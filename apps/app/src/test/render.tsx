import type { ReactElement } from "react";

import { render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { t } from "@pace/core";

import type { PaceRuntime } from "../runtime.ts";

import { PaceProvider } from "../app-state.tsx";
import { ThemeProvider } from "../ui/theme-provider.tsx";
import { ToastProvider } from "../ui/toast.tsx";

const METRICS = {
  frame: { height: 844, width: 390, x: 0, y: 0 },
  insets: { bottom: 0, left: 0, right: 0, top: 0 },
};

/** Renders a screen inside the providers the root layout sets up, over a test runtime. */
export const renderScreen = async (
  ui: ReactElement,
  runtime: PaceRuntime,
): Promise<Awaited<ReturnType<typeof render>>> =>
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <PaceProvider runtime={runtime}>
          <ToastProvider>{ui}</ToastProvider>
        </PaceProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );

/** English copy, for assertions that read like the screen. */
export const en = (key: Parameters<typeof t>[1], params?: Parameters<typeof t>[2]): string =>
  t("en", key, params);
