import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";
import { createTestServices } from "#web/test/services.ts";
import { problem } from "@pace/client/testing";

import { LoginPage } from "./login-page.tsx";

describe("LoginPage", () => {
  it("renders the branded card and the Telegram widget script for the bot", async () => {
    renderWithProviders(<LoginPage />, { route: "/login" });
    expect(await screen.findByRole("heading", { name: "Sign in to Pace" })).toBeInTheDocument();
    // The widget script has no role or text, so there is no Testing Library query for it.
    // eslint-disable-next-line testing-library/no-node-access -- script tag assertion
    const script = document.querySelector<HTMLScriptElement>(
      'script[data-telegram-login="TestBot"]',
    );
    expect(script).not.toBeNull();
    expect(script?.src).toBe("https://telegram.org/js/telegram-widget.js?22");
    expect(script?.dataset["onauth"]).toBe("onTelegramAuth(user)");
    expect(script?.dataset["requestAccess"]).toBe("write");
    expect(globalThis.onTelegramAuth).toBeTypeOf("function");
  });

  it("signs in through the dev form and navigates to ?next=", async () => {
    const { router, services, user } = renderWithProviders(<LoginPage />, {
      route: "/login?next=%2Fday",
    });
    const input = await screen.findByLabelText("Telegram id");
    expect(input).toHaveValue("1919230638");
    await user.clear(input);
    await user.type(input, "42");
    await user.click(screen.getByRole("button", { name: "Sign in as dev" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/day");
    });
    expect(services.auth.store.getState().user?.telegramId).toBe("42");
  });

  it("explains a refused account", async () => {
    const { services } = createTestServices({
      routes: {
        "POST /api/auth/dev": () => problem(403, "auth/not-allowed"),
      },
    });
    const { user } = renderWithProviders(<LoginPage />, { route: "/login", services });
    await user.click(await screen.findByRole("button", { name: "Sign in as dev" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This Telegram account is not on the list.",
    );
  });

  it("logs in through the bot: deep link, waiting state, polling", async () => {
    let polls = 0;
    const { services } = createTestServices({
      routes: {
        "GET /api/auth/nonce/n-1": () => {
          polls += 1;
          return polls < 2
            ? { status: "pending" }
            : {
                status: "ready",
                token: "tok-bot",
                user: {
                  id: "u",
                  name: "Bot User",
                  photoUrl: null,
                  telegramId: "7",
                  username: null,
                },
              };
        },
        "POST /api/auth/nonce": () => ({
          deepLink: "https://t.me/TestBot?start=login_n-1",
          nonce: "n-1",
        }),
      },
    });
    const { router, user } = renderWithProviders(<LoginPage pollIntervalMs={5} />, {
      route: "/login",
      services,
    });
    await user.click(await screen.findByRole("button", { name: "Log in with the bot instead" }));
    const link = await screen.findByRole("link", { name: "Open @TestBot in Telegram" });
    expect(link).toHaveAttribute("href", "https://t.me/TestBot?start=login_n-1");
    expect(screen.getByText("Waiting for Telegram…")).toBeInTheDocument();
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(services.auth.token()).toBe("tok-bot");
  });
});
