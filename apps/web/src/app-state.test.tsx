import { screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useAuth, useSync } from "./app-state.tsx";
import { useT } from "./i18n.tsx";
import { renderWithProviders } from "./test/render.tsx";
import { createTestServices, signedInSession } from "./test/services.ts";

const Probe = () => {
  const t = useT();
  const { status, user } = useAuth();
  const sync = useSync();
  return (
    <div>
      <p>{t("nav.now")}</p>
      <p>{t("login.openBot", { bot: "@Bot" })}</p>
      <p data-testid="auth">{status}</p>
      <p data-testid="user">{user?.name ?? "-"}</p>
      <p data-testid="sync-error">{sync.lastError ?? "-"}</p>
    </div>
  );
};

describe("PaceProvider", () => {
  it("translates with the account language and follows settings.updated", async () => {
    const { services } = renderWithProviders(<Probe />);
    expect(await screen.findByText("Now")).toBeInTheDocument();
    expect(screen.getByText("Open @Bot in Telegram")).toBeInTheDocument();
    await services.state.dispatch({
      occurredAt: new Date().toISOString(),
      payload: { language: "ru" },
      type: "settings.updated",
    });
    expect(await screen.findByText("Сейчас")).toBeInTheDocument();
  });

  it("starts the sync loop and loads the user once signed in, stops it on logout", async () => {
    const { api, services } = createTestServices({ session: await signedInSession() });
    renderWithProviders(<Probe />, { services });
    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("signed-in");
    });
    await waitFor(() => {
      expect(api.calls.map((call) => `${call.method} ${call.path}`)).toEqual(
        expect.arrayContaining(["GET /api/me", "GET /api/sync/pull"]),
      );
    });
    expect(screen.getByTestId("user")).toHaveTextContent("Dev 1919230638");
    const pullsBeforeLogout = api.calls.filter((call) => call.path === "/api/sync/pull").length;

    await services.auth.logout();
    await waitFor(() => {
      expect(screen.getByTestId("auth")).toHaveTextContent("signed-out");
    });
    globalThis.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(api.calls.filter((call) => call.path === "/api/sync/pull")).toHaveLength(
      pullsBeforeLogout,
    );
  });

  it("syncs again when the window regains focus", async () => {
    const { api, services } = createTestServices({ session: await signedInSession() });
    renderWithProviders(<Probe />, { services });
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "/api/sync/pull")).toBe(true);
    });
    const pulls = api.calls.filter((call) => call.path === "/api/sync/pull").length;
    globalThis.dispatchEvent(new Event("focus"));
    await waitFor(() => {
      expect(api.calls.filter((call) => call.path === "/api/sync/pull")).toHaveLength(pulls + 1);
    });
  });

  it("generates the week's instances once per load, after sign-in", async () => {
    const { services } = createTestServices();
    const ensure = vi.spyOn(services.actions, "ensureInstances");
    const { unmount } = renderWithProviders(<Probe />, { services });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(ensure).not.toHaveBeenCalled();

    await services.auth.loginWithDev("1919230638");
    await waitFor(() => {
      expect(ensure).toHaveBeenCalledTimes(1);
    });
    // A remount (StrictMode, a new route tree) and a new sign-in reuse the same load.
    unmount();
    renderWithProviders(<Probe />, { services });
    await services.auth.logout();
    await services.auth.loginWithDev("1919230638");
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(ensure).toHaveBeenCalledTimes(1);
  });

  it("shows a toast when a sync fails", async () => {
    const { services } = createTestServices({
      routes: {
        "GET /api/sync/pull": () =>
          Response.json({ code: "boom", message: "Server exploded" }, { status: 500 }),
      },
      session: await signedInSession(),
    });
    renderWithProviders(
      <>
        <Toaster />
        <Probe />
      </>,
      { services },
    );
    await waitFor(() => {
      expect(screen.getByTestId("sync-error")).toHaveTextContent("Server exploded");
    });
    expect(await screen.findByText(/Sync failed/)).toBeInTheDocument();
  });
});
