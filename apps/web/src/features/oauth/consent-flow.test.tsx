import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";
import { createTestServices } from "#web/test/services.ts";
import { type FakeRoute, problem } from "@pace/client/testing";

import { ConsentFlow } from "./consent-flow.tsx";

const AUTH_QUERY =
  "client_id=abc&redirect_uri=http%3A%2F%2Flocalhost%3A6274%2Fcb&scope=tasks%3Aread+tasks%3Awrite&state=s1";

const CLIENT = {
  clientDomain: null,
  clientName: "Claude",
  clientUri: null,
  logoUri: "https://claude.ai/logo.png",
  redirectHost: "localhost",
  redirectIsLoopback: true,
  scopes: ["tasks:read", "tasks:write"],
};

const setup = (routes: Readonly<Record<string, FakeRoute>> = {}) => {
  const redirect = vi.fn();
  const { api, services } = createTestServices({
    routes: {
      "GET /api/oauth/client-info": () => CLIENT,
      "POST /api/oauth/complete": () => ({ redirectTo: "http://localhost:6274/cb?code=c1" }),
      "POST /api/oauth/deny": () => ({
        redirectTo: "http://localhost:6274/cb?error=access_denied",
      }),
      ...routes,
    },
  });
  const view = renderWithProviders(<ConsentFlow authQuery={AUTH_QUERY} redirect={redirect} />, {
    route: `/oauth/authorize?${AUTH_QUERY}`,
    services,
  });
  return { ...view, api, redirect };
};

const identifyAsDev = async (user: ReturnType<typeof setup>["user"], id: string) => {
  const input = await screen.findByLabelText("Telegram id");
  await user.clear(input);
  await user.type(input, id);
  await user.click(screen.getByRole("button", { name: "Continue as dev" }));
};

describe("ConsentFlow", () => {
  it("shows the client, where access goes and the requested scopes in plain language", async () => {
    const { api } = setup();
    expect(await screen.findByRole("heading", { name: "Connecting an app" })).toBeInTheDocument();
    expect(await screen.findByText("Claude")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Claude" })).toHaveAttribute(
      "src",
      "https://claude.ai/logo.png",
    );
    expect(
      screen.getByText("This app registered itself; its name is not verified."),
    ).toBeInTheDocument();
    expect(screen.getByText("Access will be sent to localhost.")).toBeInTheDocument();
    expect(screen.getByText(/an app on this computer/)).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "See your tasks, projects and presets" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Add and change tasks and projects" }),
    ).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "See your analytics" })).not.toBeInTheDocument();
    expect(api.calls[0]).toMatchObject({ method: "GET", path: "/api/oauth/client-info" });
    // Allow needs an identity first; Deny never does.
    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
  });

  it("denies: posts the original query and sends the browser back with access_denied", async () => {
    const { api, redirect, user } = setup();
    await user.click(await screen.findByRole("button", { name: "Deny" }));
    await waitFor(() => {
      expect(redirect).toHaveBeenCalledWith("http://localhost:6274/cb?error=access_denied");
    });
    const deny = api.calls.find((call) => call.path === "/api/oauth/deny");
    expect(deny).toMatchObject({ body: { authQuery: AUTH_QUERY }, method: "POST" });
  });

  it("allows with the ticked scopes once the dev identity is known", async () => {
    const { api, redirect, user } = setup();
    await user.click(
      await screen.findByRole("checkbox", { name: "Add and change tasks and projects" }),
    );
    await identifyAsDev(user, "1001");
    expect(await screen.findByText("Signed in as dev 1001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => {
      expect(redirect).toHaveBeenCalledWith("http://localhost:6274/cb?code=c1");
    });
    const complete = api.calls.find((call) => call.path === "/api/oauth/complete");
    expect(complete?.body).toEqual({
      authQuery: AUTH_QUERY,
      devTelegramId: "1001",
      scopes: ["tasks:read"],
    });
    expect(screen.getByText("Taking you back to Claude…")).toBeInTheDocument();
  });

  it("explains a refused account and stays on the page", async () => {
    const { redirect, user } = setup({
      "POST /api/oauth/complete": () => problem(403, "auth/not-allowed"),
    });
    await identifyAsDev(user, "4242");
    await user.click(await screen.findByRole("button", { name: "Allow" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This Telegram account is not on the list.",
    );
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();
  });

  it("reports an invalid request instead of a consent form", async () => {
    setup({ "GET /api/oauth/client-info": () => problem(400, "oauth/invalid-request") });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link is not a valid connection request.",
    );
    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
  });

  it("names the domain of a verified (metadata document) client", async () => {
    setup({
      "GET /api/oauth/client-info": () => ({
        ...CLIENT,
        clientDomain: "chatgpt.com",
        logoUri: null,
        redirectHost: "chatgpt.com",
        redirectIsLoopback: false,
      }),
    });
    expect(await screen.findByText("Published by chatgpt.com")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/an app on this computer/)).not.toBeInTheDocument();
  });
});
