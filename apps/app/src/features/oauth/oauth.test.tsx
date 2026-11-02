import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { REQUEST_DEADLINE_MS } from "@pace/client";
import { problem } from "@pace/client/testing";

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

const setupConsent = async () => {
  const complete = jest.fn((_request: { readonly body: unknown }) => ({
    redirectTo: "http://localhost:6274/cb?code=c1",
  }));
  const runtime = await createTestRuntime({
    routes: {
      "GET /api/oauth/client-info": () => CLIENT,
      "POST /api/oauth/complete": complete,
      "POST /api/oauth/deny": () => ({
        redirectTo: "http://localhost:6274/cb?error=access_denied",
      }),
    },
  });
  const redirect = jest.fn<undefined, [string]>();
  await renderScreen(
    <ConsentFlow authQuery={AUTH_QUERY} redirect={redirect} renderWidget={() => null} />,
    runtime,
  );
  return { complete, redirect };
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

  it("draws the client card as a cell on the page, where its tertiary and warning lines were measured (bug-lessons 61)", async () => {
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
        <ConsentFlow authQuery={AUTH_QUERY} redirect={jest.fn()} renderWidget={() => null} />,
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

  it("explains a request the API refuses", async () => {
    const runtime = await createTestRuntime({
      routes: { "GET /api/oauth/client-info": () => problem(400, "oauth/invalid-request") },
    });
    await renderScreen(
      <ConsentFlow authQuery={AUTH_QUERY} redirect={jest.fn()} renderWidget={() => null} />,
      runtime,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(en("oauth.invalidRequest"));
  });
});
