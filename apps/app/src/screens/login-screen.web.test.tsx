import type * as ReactActual from "react";
import type * as ReactNativeActual from "react-native";

import { render, screen } from "@testing-library/react-native";

import type * as CoreActual from "@pace/core";

import { t } from "@pace/core";

import * as mockSecureStoreModule from "../testing/secure-store.fake.ts";
import { ThemeProvider } from "../ui/theme-provider.tsx";
import { LoginScreen } from "./login-screen.web.tsx";

jest.mock("expo-secure-store", () => mockSecureStoreModule.createFakeSecureStore());
jest.mock("expo-linking", () => ({
  canOpenURL: jest.fn(async () => false),
  openURL: jest.fn(async () => true),
}));
jest.mock("expo-router", () => {
  const { Text } = jest.requireActual<typeof ReactNativeActual>("react-native");
  const { useEffect } = jest.requireActual<typeof ReactActual>("react");
  const Redirect = ({ href }: { readonly href: string }) => <Text testID="redirect">{href}</Text>;
  return {
    Redirect,
    useFocusEffect: (effect: () => (() => void) | undefined) => {
      useEffect(effect, [effect]);
    },
    useLocalSearchParams: () => ({}),
  };
});

/** The widget as the page sees it: it loads, or its script fails (telegram.org blocked). */
const mockWidget = { fails: false };
jest.mock("../auth/telegram-widget.web.tsx", () => {
  const { useEffect } = jest.requireActual<typeof ReactActual>("react");
  return {
    TelegramWidget: ({ onFailed }: { readonly onFailed?: () => void }) => {
      useEffect(() => {
        if (mockWidget.fails) {
          onFailed?.();
        }
      }, [onFailed]);
      return null;
    },
  };
});

jest.mock("#app/app-state.tsx", () => ({
  useAuth: () => ({
    auth: { token: () => undefined },
    endedElsewhere: false,
    endedInAnotherTab: false,
    status: "signed-out",
    user: null,
  }),
  useT: () => {
    const { t: translate } = jest.requireActual<typeof CoreActual>("@pace/core");
    return (key: Parameters<typeof t>[1], params?: Parameters<typeof t>[2]) =>
      translate("en", key, params);
  },
}));

const isFilled = (): boolean =>
  JSON.stringify(screen.getByRole("button", { name: t("en", "login.botFallback") })).includes(
    "bg-accent",
  );

beforeEach(() => {
  mockWidget.fails = false;
});

describe("LoginScreen on the web: the bot as the way in when Telegram's button fails (F-CMP-17)", () => {
  it("keeps «Sign in with the bot» a plain action while the Telegram button is there", async () => {
    await render(
      <ThemeProvider>
        <LoginScreen />
      </ThemeProvider>,
    );
    expect(isFilled()).toBe(false);
  });

  it("makes it the filled, main button once the Telegram button could not load", async () => {
    mockWidget.fails = true;
    await render(
      <ThemeProvider>
        <LoginScreen />
      </ThemeProvider>,
    );
    expect(isFilled()).toBe(true);
  });
});
