import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";
import { createTestServices, signedInSession } from "#web/test/services.ts";
import { type FakeRoute, problem } from "@pace/client/testing";

import { ConnectedApps } from "./connected-apps.tsx";

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
  {
    clientId: "c2",
    clientName: "Cursor",
    createdAt: "2026-10-03T10:00:00.000Z",
    expiresAt: null,
    id: "g2",
    logoUri: null,
    scopes: ["tasks:read"],
  },
];

const setup = async (routes: Readonly<Record<string, FakeRoute>> = {}) => {
  const { api, services } = createTestServices({
    routes: {
      "DELETE /api/oauth/grants/g1": () => ({ ok: true }),
      "GET /api/oauth/grants": () => ({ grants: GRANTS }),
      ...routes,
    },
    session: await signedInSession(),
  });
  return { ...renderWithProviders(<ConnectedApps />, { services }), api };
};

describe("ConnectedApps", () => {
  it("lists every grant with its client, scopes and date", async () => {
    await setup();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Claude");
    expect(items[0]).toHaveTextContent("See your tasks, projects and presets");
    expect(items[0]).toHaveTextContent("Add and change tasks and projects");
    expect(items[0]).toHaveTextContent(/Connected .*2026/);
    expect(items[1]).toHaveTextContent("Cursor");
  });

  it("revokes a grant after a confirmation", async () => {
    const { api, user } = await setup();
    const claude = (await screen.findAllByRole("listitem"))[0]!;
    await user.click(within(claude).getByRole("button", { name: "Revoke" }));
    expect(within(claude).getByText("Revoke access for Claude?")).toBeInTheDocument();
    expect(api.pathsCalled("/api/oauth/grants/")).toEqual([]);
    await user.click(within(claude).getByRole("button", { name: "Cancel" }));
    expect(within(claude).queryByText("Revoke access for Claude?")).not.toBeInTheDocument();
    await user.click(within(claude).getByRole("button", { name: "Revoke" }));
    await user.click(within(claude).getByRole("button", { name: "Yes, revoke" }));
    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
    });
    expect(api.calls.at(-1)).toMatchObject({ method: "DELETE", path: "/api/oauth/grants/g1" });
    expect(screen.getByRole("listitem")).toHaveTextContent("Cursor");
  });

  it("keeps the grant and says so when revoking fails", async () => {
    const { user } = await setup({
      "DELETE /api/oauth/grants/g1": () => problem(500, "oauth/revoke-failed"),
    });
    const claude = (await screen.findAllByRole("listitem"))[0]!;
    await user.click(within(claude).getByRole("button", { name: "Revoke" }));
    await user.click(within(claude).getByRole("button", { name: "Yes, revoke" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not revoke. Try again.");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows the empty line and the failure line", async () => {
    await setup({ "GET /api/oauth/grants": () => ({ grants: [] }) });
    expect(await screen.findByText("No app is connected yet.")).toBeInTheDocument();
    await setup({ "GET /api/oauth/grants": () => problem(500, "boom") });
    expect(await screen.findByText("Could not load the connected apps.")).toBeInTheDocument();
  });
});
