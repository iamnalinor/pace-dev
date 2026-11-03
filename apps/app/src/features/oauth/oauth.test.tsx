import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { REQUEST_DEADLINE_MS } from "@pace/client";
import { fakeUser, problem } from "@pace/client/testing";

import { ConsentFlow } from "./consent-flow.tsx";

const AUTH_QUERY = "client_id=abc&scope=tasks%3Aread+tasks%3Awrite&state=s1";

const CLIENT = {
  clientDomain: null,
  clientName: "Claude",
  clientUri: null,
  logoUri: null,
  redirectHost: "localhost",
  redirectIsLoopback: true,
  scopes: ["tasks:read", "tasks:write"],
};

type CompleteRequest = {
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
};

/** What the API answers a revoked or expired session. */
const ended = () => problem(401, "auth/unauthorized");

const DEV_LOGIN = { "POST /api/auth/dev": () => ({ token: "tok_dev", user: fakeUser }) };

const setupConsent = async (
  options: {
    readonly signedIn?: boolean;
    /** A stored session read at start: signed in at once, the name only once `me` answers. */
    readonly stored?: boolean;
    readonly complete?: (request: CompleteRequest) => unknown;
    readonly me?: () => unknown;
  } = {},
) => {
  const complete = jest.fn(
    options.complete ??
      ((_request: CompleteRequest) => ({ redirectTo: "http://localhost:6274/cb?code=c1" })),
  );
  const runtime = await createTestRuntime({
    routes: {
      ...DEV_LOGIN,
      ...(options.me !== undefined && { "GET /api/me": options.me }),
      "GET /api/oauth/client-info": () => CLIENT,
      "POST /api/oauth/complete": complete,
      "POST /api/oauth/deny": () => ({
        redirectTo: "http://localhost:6274/cb?error=access_denied",
      }),
    },
  });
  if (options.signedIn === true) {
    await runtime.auth.loginWithDev("1");
  }
  if (options.stored === true) {
    void runtime.auth.adoptToken("tok_stored");
  }
  const redirect = jest.fn<undefined, [string]>();
  const signIn = jest.fn<undefined, []>();
  const widget = jest.fn(() => null);
  await renderScreen(
    <ConsentFlow
      authQuery={AUTH_QUERY}
      onSignIn={signIn}
      redirect={redirect}
      renderWidget={widget}
    />,
    runtime,
  );
  return { complete, redirect, runtime, signIn, widget };
};

describe("ConsentFlow", () => {
  it("shows the client and its scopes; Allow waits for an identity, Deny does not", async () => {
    const { redirect } = await setupConsent();
    expect(await screen.findByText("Claude")).toBeOnTheScreen();
    expect(screen.getByText(en("oauth.loopbackWarning"))).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: en("oauth.scope.tasksRead") })).toBeChecked();
    expect(screen.getByRole("button", { name: en("oauth.allow") })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: en("oauth.deny") }));
    await waitFor(() => {
      expect(redirect).toHaveBeenCalledWith("http://localhost:6274/cb?error=access_denied");
    });
  });

  it("draws the client card as a cell on the page, where its tertiary and warning lines were measured (bug-lessons 112)", async () => {
    await setupConsent();
    const warning = await screen.findByText(en("oauth.loopbackWarning"));
    const card = String(warning.parent?.props["className"] ?? "").split(" ");
    expect(card).toContain("bg-cell");
    expect(card.filter((name) => name.startsWith("bg-fill"))).toEqual([]);
  });

  it("allows with the ticked scopes only, as the dev identity", async () => {
    const { complete, redirect } = await setupConsent();
    await fireEvent.press(
      await screen.findByRole("checkbox", { name: en("oauth.scope.tasksWrite") }),
    );
    await fireEvent.press(screen.getByRole("button", { name: en("oauth.devUse") }));
    await fireEvent.press(screen.getByRole("button", { name: en("oauth.allow") }));
    await waitFor(() => {
      expect(redirect).toHaveBeenCalledWith("http://localhost:6274/cb?code=c1");
    });
    expect(complete.mock.calls[0]?.[0].body).toEqual({
      authQuery: AUTH_QUERY,
      devTelegramId: "1919230638",
      scopes: ["tasks:read"],
    });
  });

  it("says it failed when the request's details never come, instead of loading for good (round 6, class 62)", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/oauth/client-info": async () => await new Promise<never>(() => undefined),
      },
    });
    jest.useFakeTimers();
    try {
      await renderScreen(
        <ConsentFlow
          authQuery={AUTH_QUERY}
          onSignIn={jest.fn()}
          redirect={jest.fn()}
          renderWidget={() => null}
        />,
        runtime,
      );
      await act(async () => {
        await jest.advanceTimersByTimeAsync(REQUEST_DEADLINE_MS);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(en("oauth.failed"));
    } finally {
      jest.useRealTimers();
    }
  });

  it("uses the browser's Pace session: names the person, no widget, Allow sends the bearer and no Telegram proof (owner bug 2026-11-03)", async () => {
    const { complete, redirect, widget } = await setupConsent({ signedIn: true });
    expect(
      await screen.findByText(en("oauth.signedInAs", { name: fakeUser.name })),
    ).toBeOnTheScreen();
    expect(widget).not.toHaveBeenCalled();
    expect(screen.queryByText(en("oauth.identify"))).toBeNull();
    expect(screen.queryByRole("button", { name: en("oauth.devUse") })).toBeNull();
    // No line on the page asks a signed-in person to sign in with Telegram (class 119).
    expect(screen.queryByText(/Telegram/u)).toBeNull();
    const allow = screen.getByRole("button", { name: en("oauth.allow") });
    expect(allow).toBeEnabled();
    await fireEvent.press(allow);
    await waitFor(() => {
      expect(redirect).toHaveBeenCalledWith("http://localhost:6274/cb?code=c1");
    });
    expect(complete).toHaveBeenCalledTimes(1);
    const request = complete.mock.calls[0]?.[0];
    expect(request?.body).toEqual({ authQuery: AUTH_QUERY, scopes: ["tasks:read", "tasks:write"] });
    expect(request?.headers["authorization"]).toBe("Bearer tok_dev");
  });

  it("keeps Allow disabled until it knows whose session it is (A9 review m1)", async () => {
    const held = Promise.withResolvers<unknown>();
    // A reload: the stored session is read at once, the name only when `me` answers.
    const { complete } = await setupConsent({ me: async () => await held.promise, stored: true });
    expect(await screen.findByText("Claude")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: en("oauth.allow") })).toBeDisabled();
    expect(screen.queryByText(/^Signed in/u)).toBeNull();
    expect(screen.queryByText(en("oauth.identify"))).toBeNull();
    await act(async () => {
      held.resolve({ ...fakeUser, storeId: "store-test" });
    });
    expect(
      await screen.findByText(en("oauth.signedInAs", { name: fakeUser.name })),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: en("oauth.allow") })).toBeEnabled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("falls back to signing in when the server says the session ended, and then goes quiet", async () => {
    const me = jest.fn((): unknown => ({ ...fakeUser, storeId: "store-test" }));
    const { complete, redirect, runtime, widget } = await setupConsent({
      complete: ended,
      me,
      signedIn: true,
    });
    await screen.findByText(en("oauth.signedInAs", { name: fakeUser.name }));
    me.mockImplementation(ended);
    await fireEvent.press(screen.getByRole("button", { name: en("oauth.allow") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en("oauth.sessionEnded"));
    // The app's session check heard the 401 and signed out: the page offers signing in.
    expect(await screen.findByText(en("oauth.identify"))).toBeOnTheScreen();
    expect(widget).toHaveBeenCalled();
    expect(runtime.auth.store.getState().status).toBe("signed-out");
    expect(screen.getByRole("button", { name: en("oauth.allow") })).toBeDisabled();
    expect(redirect).not.toHaveBeenCalled();
    // Steady state: one Allow, one session check, nothing repeated.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(me.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it.each([
    [403, "auth/not-allowed", "login.notAllowed"],
    [403, "auth/forbidden", "oauth.deviceToken"],
    [422, "auth/identity-conflict", "oauth.identityConflict"],
  ] as const)(
    "a session refused with %i %s says why in words, once, and asks nothing more (A9 review m3)",
    async (status, code, key) => {
      const { complete, redirect } = await setupConsent({
        complete: () => problem(status, code),
        signedIn: true,
      });
      await screen.findByText(en("oauth.signedInAs", { name: fakeUser.name }));
      await fireEvent.press(screen.getByRole("button", { name: en("oauth.allow") }));
      expect(await screen.findByRole("alert")).toHaveTextContent(en(key));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(complete).toHaveBeenCalledTimes(1);
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it("signed out, offers the widget and a way to the app's own sign-in", async () => {
    const { signIn, widget } = await setupConsent();
    expect(await screen.findByText(en("oauth.identify"))).toBeOnTheScreen();
    expect(widget).toHaveBeenCalled();
    expect(screen.getByText(en("oauth.widgetMissing"))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("oauth.signInFirst") }));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("explains a request the API refuses", async () => {
    const runtime = await createTestRuntime({
      routes: { "GET /api/oauth/client-info": () => problem(400, "oauth/invalid-request") },
    });
    await renderScreen(
      <ConsentFlow
        authQuery={AUTH_QUERY}
        onSignIn={jest.fn()}
        redirect={jest.fn()}
        renderWidget={() => null}
      />,
      runtime,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(en("oauth.invalidRequest"));
  });
});
