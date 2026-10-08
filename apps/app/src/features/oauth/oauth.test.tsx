import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { problem } from "@pace/client/testing";

import { ConnectedApps } from "./connected-apps.tsx";
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

const GRANTS = [
  {
    clientId: "c1",
    clientName: "Claude",
    createdAt: "2026-10-01T10:00:00.000Z",
    expiresAt: null,
    id: "g1",
    logoUri: null,
    scopes: ["tasks:read", "tasks:write"],
  },
];

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

describe("ConnectedApps", () => {
  it("lists the grants and revokes one after a confirmation", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "DELETE /api/oauth/grants/g1": () => ({ ok: true }),
        "GET /api/oauth/grants": () => ({ grants: GRANTS }),
      },
    });
    await renderScreen(<ConnectedApps />, runtime);
    expect(await screen.findByText("Claude")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("connectedApps.revoke") }));
    await fireEvent.press(screen.getByRole("button", { name: en("connectedApps.revokeYes") }));
    expect(await screen.findByText(en("connectedApps.empty"))).toBeOnTheScreen();
  });

  it("says so when the list cannot load or a revoke fails", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "DELETE /api/oauth/grants/g1": () => problem(500, "server/error"),
        "GET /api/oauth/grants": () => ({ grants: GRANTS }),
      },
    });
    await renderScreen(<ConnectedApps />, runtime);
    await fireEvent.press(await screen.findByRole("button", { name: en("connectedApps.revoke") }));
    await fireEvent.press(screen.getByRole("button", { name: en("connectedApps.revokeYes") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(en("connectedApps.revokeFailed"));
  });
});
