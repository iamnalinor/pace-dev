import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { frozenServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { MOSCOW, NOW } from "@pace/core/testing";

import { ZoneBanner } from "./zone-banner.tsx";

describe("ZoneBanner", () => {
  it("stays hidden until the account has a zone that differs from the device's", async () => {
    const { services } = frozenServices();
    renderWithProviders(<ZoneBanner />, { services });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await services.state.dispatch({
      occurredAt: NOW,
      payload: { timezone: "Europe/Minsk" },
      type: "settings.updated",
    });
    // Minsk shares Moscow's offset: nothing to warn about.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await services.state.dispatch({
      occurredAt: NOW,
      payload: { timezone: "Pacific/Chatham" },
      type: "settings.updated",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "This device is in Europe/Moscow; the account uses Pacific/Chatham.",
    );
  });

  it("switches the account to the device zone in one tap", async () => {
    const { services } = frozenServices();
    await services.state.dispatch({
      occurredAt: NOW,
      payload: { timezone: "Pacific/Chatham" },
      type: "settings.updated",
    });
    const { user } = renderWithProviders(<ZoneBanner />, { services });
    await user.click(await screen.findByRole("button", { name: "Use Europe/Moscow" }));
    expect(
      await screen.findByRole("button", { name: "Use Europe/Moscow" }).catch(() => null),
    ).toBeNull();
    expect(services.state.store.getState().settings.timezone).toBe(MOSCOW);
  });
});
