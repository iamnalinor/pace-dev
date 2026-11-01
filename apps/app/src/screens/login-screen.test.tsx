import type * as ReactActual from "react";
import type * as ReactNativeActual from "react-native";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { openURL } from "expo-linking";
import { openAuthSessionAsync } from "expo-web-browser";

import type { Auth, BotLogin } from "@pace/client";
import type * as CoreActual from "@pace/core";

import { fakeUser } from "@pace/client/testing";
import { ok, t } from "@pace/core";

import type * as DeviceIdActual from "../platform/device-id.ts";

import * as mockSecureStoreModule from "../testing/secure-store.fake.ts";
import { ThemeProvider } from "../ui/theme-provider.tsx";
import { LoginScreen } from "./login-screen.tsx";

jest.mock("expo-secure-store", () => mockSecureStoreModule.createFakeSecureStore());
jest.mock("expo-constants", () => {
  const actual = jest.requireActual<{ readonly default: object }>("expo-constants");
  return { __esModule: true, default: { ...actual.default, deviceName: "Pixel 9a" } };
});
jest.mock("expo-linking", () => ({
  // No Telegram app in the test: the bot opens through t.me.
  canOpenURL: jest.fn(async () => false),
  openURL: jest.fn(async () => true),
}));
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
  resumeBotLogin: jest.fn(),
  startBotLogin: jest.fn(),
};
const mockStatus = {
  current: "signed-out" as "signed-in" | "signed-out",
  endedElsewhere: false,
};
const mockPending = {
  current: null as null | { readonly nonce: string; readonly expiresAt: number },
};

jest.mock("./bot-login-pending.ts", () => ({
  clearPendingBotLogin: () => {
    mockPending.current = null;
  },
  readPendingBotLogin: (now: number) =>
    mockPending.current !== null && mockPending.current.expiresAt > now
      ? mockPending.current
      : null,
  savePendingBotLogin: (value: { readonly nonce: string; readonly expiresAt: number }) => {
    mockPending.current = value;
  },
}));

jest.mock("#app/app-state.tsx", () => ({
  useAuth: () => ({
    auth: mockAuth,
    endedElsewhere: mockStatus.endedElsewhere,
    status: mockStatus.current,
    user: null,
  }),
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
  mockStatus.endedElsewhere = false;
  mockPending.current = null;
});

const renderScreen = async (): Promise<Awaited<ReturnType<typeof render>>> =>
  await render(
    <ThemeProvider>
      <LoginScreen />
    </ThemeProvider>,
  );

describe("LoginScreen", () => {
  it("says why when the session was ended elsewhere (QA round 15 L2)", async () => {
    mockStatus.endedElsewhere = true;
    await renderScreen();
    expect(screen.getByText(t("en", "login.endedElsewhere"))).toBeOnTheScreen();
  });

  it("says nothing of the kind on a plain visit", async () => {
    await renderScreen();
    expect(screen.queryByText(t("en", "login.endedElsewhere"))).toBeNull();
  });

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
    // From the app: the bot's "Return to Pace" button leads back into it, and the session it
    // opens is named after this phone and linked to its install id.
    const { loadDeviceId } = jest.requireActual<typeof DeviceIdActual>("../platform/device-id.ts");
    expect(auth.startBotLogin).toHaveBeenCalledWith("app", {
      deviceId: await loadDeviceId(),
      deviceName: "Pixel 9a",
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

  it("resumes the waiting bot login after a page remount", async () => {
    const waitForToken = jest.fn(
      async ({ signal }: { readonly signal?: AbortSignal }) =>
        await new Promise<Awaited<ReturnType<BotLogin["waitForToken"]>>>((resolve) => {
          signal?.addEventListener("abort", () => {
            resolve({ error: "cancelled", ok: false });
          });
        }),
    );
    auth.startBotLogin.mockResolvedValue({ deepLink: "https://t.me/x", nonce: "n", waitForToken });
    auth.resumeBotLogin.mockReturnValue({ nonce: "n", waitForToken });
    const first = await renderScreen();
    await fireEvent.press(screen.getByText("Open Telegram"));
    await waitFor(() => {
      expect(screen.getByText("Waiting for Telegram…")).toBeOnTheScreen();
    });
    expect(mockPending.current?.nonce).toBe("n");
    await first.unmount();
    await renderScreen();
    expect(auth.resumeBotLogin).toHaveBeenCalledWith("n");
    expect(screen.getByText("Waiting for Telegram…")).toBeOnTheScreen();
    expect(waitForToken).toHaveBeenCalledTimes(2);
    // Back without pressing Start: the same link opens the bot again, no new login.
    (openURL as jest.Mock).mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Open the bot again" }));
    await waitFor(() => {
      expect(openURL).toHaveBeenCalledWith("https://t.me/x");
    });
    expect(auth.startBotLogin).toHaveBeenCalledTimes(1);
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
