import { act, renderHook } from "@testing-library/react-native";

import type { BotLogin } from "@pace/client";

import { openTelegram } from "../auth/open-telegram.ts";
import { loginDevice } from "../platform/login-from.ts";
import { clearPendingBotLogin, readPendingBotLogin } from "./bot-login-pending.ts";
import { useBotLogin } from "./use-bot-login.ts";

const mockAuth = { startBotLogin: jest.fn(), resumeBotLogin: jest.fn() };

jest.mock("../app-state.tsx", () => ({ useAuth: () => ({ auth: mockAuth }) }));
jest.mock("../auth/open-telegram.ts", () => ({ openTelegram: jest.fn() }));
jest.mock("../platform/login-from.ts", () => ({ LOGIN_FROM: "app", loginDevice: jest.fn() }));
jest.mock("./bot-login-pending.ts", () => {
  let pending: unknown = null;
  return {
    clearPendingBotLogin: () => {
      pending = null;
    },
    readPendingBotLogin: () => pending,
    savePendingBotLogin: (value: unknown) => {
      pending = value;
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  clearPendingBotLogin();
  jest.mocked(loginDevice).mockResolvedValue(undefined);
});

it.each(["resolve", "reject"] as const)(
  "ignores stale nonce creation %s after disable and recovery",
  async (outcome) => {
    const creation = Promise.withResolvers<BotLogin>();
    const waitForToken = jest.fn(
      () => Promise.withResolvers<Awaited<ReturnType<BotLogin["waitForToken"]>>>().promise,
    );
    mockAuth.startBotLogin.mockReturnValue(creation.promise);
    const view = await renderHook(
      ({ enabled }: { readonly enabled: boolean }) => useBotLogin(enabled),
      {
        initialProps: { enabled: true },
      },
    );
    let started = Promise.resolve();
    await act(async () => {
      started = view.result.current.start();
    });
    expect(mockAuth.startBotLogin).toHaveBeenCalledTimes(1);
    await view.rerender({ enabled: false });
    await view.rerender({ enabled: true });
    await act(async () => {
      if (outcome === "resolve") {
        creation.resolve({ nonce: "stale", deepLink: "https://t.me/stale", waitForToken });
      } else {
        creation.reject(new Error("stale failure"));
      }
      await started;
    });
    expect(view.result.current.phase).toEqual({ kind: "idle" });
    expect(readPendingBotLogin(Date.now())).toBeNull();
    expect(waitForToken).not.toHaveBeenCalled();
    expect(openTelegram).not.toHaveBeenCalled();
    await view.unmount();
  },
);

it.each(["resolve", "reject"] as const)(
  "ignores device lookup %s after disable and recovery",
  async (outcome) => {
    const device = Promise.withResolvers<undefined>();
    jest.mocked(loginDevice).mockReturnValue(device.promise);
    const view = await renderHook(
      ({ enabled }: { readonly enabled: boolean }) => useBotLogin(enabled),
      {
        initialProps: { enabled: true },
      },
    );
    let started = Promise.resolve();
    await act(async () => {
      started = view.result.current.start();
    });
    await view.rerender({ enabled: false });
    await view.rerender({ enabled: true });
    await act(async () => {
      if (outcome === "resolve") {
        device.resolve(undefined);
      } else {
        device.reject(new Error("stale device failure"));
      }
      await started;
    });
    expect(mockAuth.startBotLogin).not.toHaveBeenCalled();
    expect(view.result.current.phase).toEqual({ kind: "idle" });
    expect(readPendingBotLogin(Date.now())).toBeNull();
    expect(openTelegram).not.toHaveBeenCalled();
    await view.unmount();
  },
);

it("invalidates an in-flight nonce creation when reset", async () => {
  const creation = Promise.withResolvers<BotLogin>();
  const waitForToken = jest.fn(
    () => Promise.withResolvers<Awaited<ReturnType<BotLogin["waitForToken"]>>>().promise,
  );
  mockAuth.startBotLogin.mockReturnValue(creation.promise);
  const view = await renderHook(() => useBotLogin());
  let started = Promise.resolve();
  await act(async () => {
    started = view.result.current.start();
  });
  await act(async () => {
    view.result.current.reset();
  });
  await act(async () => {
    creation.resolve({ nonce: "stale", deepLink: "https://t.me/stale", waitForToken });
    await started;
  });
  expect(view.result.current.phase).toEqual({ kind: "idle" });
  expect(readPendingBotLogin(Date.now())).toBeNull();
  expect(waitForToken).not.toHaveBeenCalled();
  expect(openTelegram).not.toHaveBeenCalled();
  await view.unmount();
});
