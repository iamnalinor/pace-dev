import type * as ReactActual from "react";
import type * as ReactNativeActual from "react-native";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { openURL } from "expo-linking";
import { openAuthSessionAsync } from "expo-web-browser";

import type { Auth, BotLogin } from "@pace/client";
import type * as CoreActual from "@pace/core";

import { fakeUser } from "@pace/client/testing";
import { ok, type t } from "@pace/core";

import * as mockSecureStoreModule from "../testing/secure-store.fake.ts";
import { ThemeProvider } from "../ui/theme-provider.tsx";
import { LoginScreen } from "./login-screen.tsx";

jest.mock("expo-secure-store", () => mockSecureStoreModule.createFakeSecureStore());
jest.mock("expo-linking", () => ({ openURL: jest.fn(async () => true) }));
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: "cancel" })),
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
  };
});

const mockAuth = {
  adoptToken: jest.fn(),
  loginWithDev: jest.fn(),
  startBotLogin: jest.fn(),
};
const mockStatus = { current: "signed-out" as "signed-in" | "signed-out" };

jest.mock("#app/app-state.tsx", () => ({
  useAuth: () => ({ auth: mockAuth, status: mockStatus.current, user: null }),
  useT: () => {
    const { t: translate } = jest.requireActual<typeof CoreActual>("@pace/core");
    return (key: Parameters<typeof t>[1], params?: Parameters<typeof t>[2]) =>
      translate("en", key, params);
  },
}));

const auth = mockAuth as unknown as jest.Mocked<Auth> & typeof mockAuth;

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.current = "signed-out";
});

const renderScreen = async (): Promise<Awaited<ReturnType<typeof render>>> =>
  await render(
    <ThemeProvider>
      <LoginScreen />
    </ThemeProvider>,
  );

describe("LoginScreen", () => {
  it("signs in through the dev route with the typed Telegram id", async () => {
    auth.loginWithDev.mockResolvedValue(ok(fakeUser));
    await renderScreen();
    await fireEvent.changeText(screen.getByLabelText("Telegram id"), "1919");
    await fireEvent.press(screen.getByText("Sign in as dev"));
    expect(auth.loginWithDev).toHaveBeenCalledWith("1919");
  });

  it("opens the bot deep link and polls until the token arrives", async () => {
    const poll = Promise.withResolvers<Awaited<ReturnType<BotLogin["waitForToken"]>>>();
    const waitForToken = jest.fn<
      ReturnType<BotLogin["waitForToken"]>,
      Parameters<BotLogin["waitForToken"]>
    >(async () => await poll.promise);
    auth.startBotLogin.mockResolvedValue({
      deepLink: "https://t.me/PaceTaskTrackerBot?start=login_abc",
      nonce: "abc",
      waitForToken,
    });
    await renderScreen();
    await fireEvent.press(screen.getByText("Open Telegram"));
    await waitFor(() => {
      expect(openURL).toHaveBeenCalledWith("https://t.me/PaceTaskTrackerBot?start=login_abc");
    });
    expect(screen.getByText("Waiting for Telegram…")).toBeOnTheScreen();
    const [options] = waitForToken.mock.calls[0] ?? [];
    expect(options?.intervalMs).toBe(2000);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    mockStatus.current = "signed-in";
    await act(async () => {
      poll.resolve(ok(fakeUser));
      await Promise.resolve();
    });
    expect(screen.queryByText("Waiting for Telegram…")).toBeNull();
    expect(screen.getByTestId("redirect")).toHaveTextContent("/");
  });

  it("explains a rejected Telegram account", async () => {
    auth.startBotLogin.mockResolvedValue({
      deepLink: "https://t.me/PaceTaskTrackerBot?start=login_abc",
      nonce: "abc",
      waitForToken: jest.fn(async () => ({ error: "not-allowed", ok: false }) as const),
    });
    await renderScreen();
    await fireEvent.press(screen.getByText("Open Telegram"));
    await waitFor(() => {
      expect(screen.getByText("This Telegram account is not on the list.")).toBeOnTheScreen();
    });
    expect(screen.getByText("Open Telegram")).toBeOnTheScreen();
  });

  it("stops polling when the screen unmounts", async () => {
    const waitForToken = jest.fn(
      async ({ signal }: { readonly signal?: AbortSignal }) =>
        await new Promise<Awaited<ReturnType<BotLogin["waitForToken"]>>>((resolve) => {
          signal?.addEventListener("abort", () => {
            resolve({ error: "cancelled", ok: false });
          });
        }),
    );
    auth.startBotLogin.mockResolvedValue({ deepLink: "https://t.me/x", nonce: "n", waitForToken });
    const { unmount } = await renderScreen();
    await fireEvent.press(screen.getByText("Open Telegram"));
    await waitFor(() => {
      expect(waitForToken).toHaveBeenCalled();
    });
    const [{ signal }] = waitForToken.mock.calls[0] ?? [{}];
    await unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("adopts the token returned by the browser login", async () => {
    jest.mocked(openAuthSessionAsync).mockResolvedValueOnce({
      type: "success",
      url: "pace://auth?token=tok_web",
    });
    auth.adoptToken.mockResolvedValue(ok(fakeUser));
    await renderScreen();
    await fireEvent.press(screen.getByText("Log in on the web instead"));
    await waitFor(() => {
      expect(auth.adoptToken).toHaveBeenCalledWith("tok_web");
    });
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      "https://pace.nalinor.dev/login?return=app",
      "pace://auth",
    );
  });

  it("leaves the screen once signed in", async () => {
    mockStatus.current = "signed-in";
    await renderScreen();
    expect(screen.getByTestId("redirect")).toHaveTextContent("/");
  });
});
