import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { openAuthSessionAsync } from "expo-web-browser";
import { AppState } from "react-native";

import type { FakeSecureStore } from "#app/testing/secure-store.fake.ts";

import { API_BASE_URL } from "#app/platform/api-base.ts";
import { serverStore } from "#app/platform/server-store.ts";
import { readServer } from "#app/platform/server.ts";
import { LoginScreen } from "#app/screens/login-screen.tsx";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { createFakeFetch, fakeInstance, type FakeRoute, problem } from "@pace/client/testing";
import { InstanceSchema } from "@pace/core";

import { IncompatibleGate } from "./incompatible-screen.tsx";

jest.mock("expo-linking", () => ({
  canOpenURL: jest.fn(async () => false),
  openURL: jest.fn(async () => true),
}));
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: "cancel" })),
}));

const secureStore = SecureStore as unknown as FakeSecureStore;

/** The server the person types: whatever `answer` says to `GET /api/instance`. */
const typedServer = (answer: FakeRoute) => {
  const fake = createFakeFetch({ "GET /api/instance": answer });
  return jest.spyOn(globalThis, "fetch").mockImplementation(fake.fetch as typeof fetch);
};

const theirInstance = {
  ...fakeInstance,
  apiOrigin: "https://pace.example.dev",
  botUsername: "MyPaceBot",
  name: "Pace",
  version: "1.2.3",
  webOrigin: null,
};

beforeEach(() => {
  jest.restoreAllMocks();
  // Only this test's runtime listens for returns to the app.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- clearing the jest mock, never calling it
  jest.mocked(AppState.addEventListener).mockClear();
  secureStore.values.delete("pace.server");
  secureStore.values.delete("pace.session");
  serverStore.setState({ instance: null, origin: API_BASE_URL, reason: null, status: "unknown" });
});

const renderLogin = async (routes: Readonly<Record<string, FakeRoute>> = {}) => {
  const runtime = await createTestRuntime({ routes, world: "empty" });
  await renderScreen(<LoginScreen />, runtime);
  return runtime;
};

const changeButton = (host: string) =>
  screen.getByRole("button", { name: en("server.changeLabel", { host }) });

const openSheet = async () => {
  await fireEvent.press(changeButton("pace-api.nalinor.dev"));
  return screen.getByLabelText(en("server.address"));
};

describe("Change server", () => {
  it("checks a typed server, shows what it is, and moves the app to it", async () => {
    await renderLogin();
    expect(screen.getByText("Server: pace-api.nalinor.dev · Change")).toBeOnTheScreen();
    const field = await openSheet();
    typedServer(() => theirInstance);
    await fireEvent.changeText(field, "pace.example.dev");
    await fireEvent.press(screen.getByRole("button", { name: "Check" }));

    expect(await screen.findByLabelText("Version: 1.2.3")).toBeOnTheScreen();
    expect(screen.getByLabelText("Name: Pace")).toBeOnTheScreen();
    expect(screen.getByLabelText("Telegram bot: @MyPaceBot")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Use this server" }));

    await waitFor(async () => {
      await expect(readServer()).resolves.toBe("https://pace.example.dev");
    });
    expect(await screen.findByText("Server: pace.example.dev · Change")).toBeOnTheScreen();
    expect(screen.queryByLabelText(en("server.address"))).toBeNull();
  });

  it("moves once when Use this server is tapped twice in a row", async () => {
    const runtime = await renderLogin();
    const reset = jest.spyOn(runtime, "resetLocalData");
    const field = await openSheet();
    typedServer(() => theirInstance);
    await fireEvent.changeText(field, "pace.example.dev");
    await fireEvent.press(screen.getByRole("button", { name: "Check" }));
    const use = await screen.findByRole("button", { name: "Use this server" });
    await act(async () => {
      void fireEvent.press(use);
      void fireEvent.press(use);
    });
    await waitFor(async () => {
      await expect(readServer()).resolves.toBe("https://pace.example.dev");
    });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not offer a server whose answer came after the address was edited", async () => {
    await renderLogin();
    const field = await openSheet();
    const answer = Promise.withResolvers<unknown>();
    typedServer(async () => await answer.promise);
    await fireEvent.changeText(field, "pace.example.dev");
    await fireEvent.press(screen.getByRole("button", { name: "Check" }));
    await fireEvent.changeText(field, "other.example.dev");
    await act(async () => {
      answer.resolve(theirInstance);
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: "Use this server" })).toBeNull();
    expect(screen.getByRole("button", { name: "Check" })).toBeOnTheScreen();
  });

  it.each([
    ["not a url", () => theirInstance, "Enter the server's address, like pace.example.dev"],
    // eslint-disable-next-line sonarjs/no-clear-text-protocols, unicorn/prefer-https -- the plain-http address the check refuses
    ["http://pace.example.dev", () => theirInstance, "Use an https:// address"],
    [
      "pace.example.dev",
      () => {
        throw new TypeError("Network request failed");
      },
      "Can't reach this server",
    ],
    ["pace.example.dev", () => problem(404, "not-found"), "This is not a Pace server"],
    [
      "pace.example.dev",
      () => ({ ...theirInstance, minClientProtocol: 0, protocol: 0 }),
      "This server runs an older Pace. Update the server or use another one.",
    ],
  ] as const)("refuses %s with a word on why", async (typed, answer, message) => {
    await renderLogin();
    const field = await openSheet();
    typedServer(answer);
    await fireEvent.changeText(field, typed);
    await fireEvent.press(screen.getByRole("button", { name: "Check" }));
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Use this server" })).toBeNull();
    await expect(readServer()).resolves.toBe(API_BASE_URL);
  });

  it("goes back to the build's server on Reset to default", async () => {
    secureStore.values.set("pace.server", "https://pace.example.dev");
    serverStore.setState({ origin: "https://pace.example.dev" });
    await renderLogin();
    await fireEvent.press(changeButton("pace.example.dev"));
    await fireEvent.press(screen.getByRole("button", { name: "Reset to default" }));
    await waitFor(async () => {
      await expect(readServer()).resolves.toBe(API_BASE_URL);
    });
    expect(await screen.findByText("Server: pace-api.nalinor.dev · Change")).toBeOnTheScreen();
  });

  it("offers the browser login only on the chosen server's own web app", async () => {
    serverStore.setState({
      instance: InstanceSchema.parse(theirInstance),
      origin: "https://pace.example.dev",
      status: "ok",
    });
    await renderLogin({ "GET /api/instance": () => theirInstance });
    // That server has no web app: another server's web login would hand back a foreign token.
    expect(screen.queryByText(en("login.webFallback"))).toBeNull();

    await act(async () => {
      serverStore.setState({
        instance: InstanceSchema.parse({ ...theirInstance, webOrigin: "https://web.example.dev" }),
      });
    });
    await fireEvent.press(screen.getByText(en("login.webFallback")));
    expect(openAuthSessionAsync).toHaveBeenCalledWith(
      "https://web.example.dev/login?return=app",
      "pace://auth",
    );
  });
});

const renderSignedIn = async (routes: Readonly<Record<string, FakeRoute>>) => {
  const runtime = await createTestRuntime({ routes, world: "empty" });
  await runtime.auth.me();
  await renderScreen(
    <IncompatibleGate>
      <LoginScreen />
    </IncompatibleGate>,
    runtime,
  );
  return runtime;
};

const expectOnlyLogOut = async (detail: string) => {
  expect(await screen.findByText("Server and app versions don't match")).toBeOnTheScreen();
  expect(screen.getByText(detail)).toBeOnTheScreen();
  expect(screen.getAllByRole("button")).toEqual([screen.getByRole("button", { name: "Log out" })]);
  expect(screen.queryByText(/Change/u)).toBeNull();
};

describe("Versions that do not fit", () => {
  it("refuses to start a sign-in on a server too old for this app, keeping Change", async () => {
    const nonce = jest.fn(() => ({ deepLink: "https://t.me/x", expiresAt: "", nonce: "n" }));
    await renderLogin({
      "GET /api/auth/nonce": nonce,
      "GET /api/instance": () => ({ ...fakeInstance, minClientProtocol: 0, protocol: 0 }),
    });
    await waitFor(() => {
      expect(serverStore.getState().status).toBe("incompatible");
    });
    await fireEvent.press(screen.getByText(en("login.openTelegram")));
    expect(screen.getByText("Server and app versions don't match")).toBeOnTheScreen();
    expect(
      screen.getByText("This server runs an older Pace. Update the server or use another one."),
    ).toBeOnTheScreen();
    expect(nonce).not.toHaveBeenCalled();
    expect(screen.getByText("Server: pace-api.nalinor.dev · Change")).toBeOnTheScreen();
  });

  it("blocks a signed-in app the server finds too old, with only Log out, then offers Change", async () => {
    const runtime = await renderSignedIn({
      "GET /api/instance": () => ({ ...fakeInstance, minClientProtocol: 2, protocol: 2 }),
    });
    await expectOnlyLogOut("Update the app to keep using this server.");
    await fireEvent.press(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => {
      expect(runtime.auth.store.getState().status).toBe("signed-out");
    });
    expect(await screen.findByText("Server: pace-api.nalinor.dev · Change")).toBeOnTheScreen();
  });

  it("blocks the same way when any call is refused as too old an app (426)", async () => {
    await renderSignedIn({
      "GET /api/instance": () => fakeInstance,
      "GET /api/sync/pull": () => problem(426, "client/outdated"),
    });
    await expectOnlyLogOut("Update the app to keep using this server.");
  });

  it("treats a server without /api/instance as one older than this app supports", async () => {
    await renderSignedIn({ "GET /api/instance": () => problem(404, "not-found") });
    await expectOnlyLogOut(
      "This server runs an older Pace. Update the server, or log out and sign in on another one.",
    );
  });

  it.each([
    [
      "is offline",
      () => {
        throw new TypeError("Network request failed");
      },
    ],
    ["rate-limits the check (429)", () => problem(429, "rate-limited")],
    ["sits behind a firewall challenge (403)", () => new Response("<html>", { status: 403 })],
    [
      "is hidden by a captive portal (200 HTML)",
      () => new Response("<html>Wi-Fi login</html>", { status: 200 }),
    ],
  ] as const)("blocks nothing when the server %s", async (_, answer) => {
    const instance = jest.fn(answer);
    await renderSignedIn({ "GET /api/instance": instance });
    await waitFor(() => {
      expect(instance).toHaveBeenCalled();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(serverStore.getState().status).toBe("unknown");
    expect(screen.queryByText("Server and app versions don't match")).toBeNull();
  });

  it("asks again on return to the app, and lets the person in once the versions fit", async () => {
    const answer = { current: { ...fakeInstance, minClientProtocol: 2, protocol: 2 } };
    await renderSignedIn({ "GET /api/instance": () => answer.current });
    await expectOnlyLogOut("Update the app to keep using this server.");

    // The server was rolled back (or the app updated) while the app was in the background.
    answer.current = { ...fakeInstance };
    // eslint-disable-next-line @typescript-eslint/unbound-method -- inspecting the jest mock, never calling it
    const changes = jest.mocked(AppState.addEventListener).mock.calls;
    await act(async () => {
      for (const [type, listener] of changes) {
        if (type === "change") {
          listener("active");
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      expect(screen.queryByText("Server and app versions don't match")).toBeNull();
    });
    expect(serverStore.getState().status).toBe("ok");
  });
});
