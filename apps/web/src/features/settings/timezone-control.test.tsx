import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";

import { TimezoneControl } from "./timezone-control.tsx";

const deviceZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;

describe("TimezoneControl", () => {
  it("offers the device zone when the account has none, then shows it as set", async () => {
    const { services, user } = renderWithProviders(<TimezoneControl />);
    expect(await screen.findByText(`This device: ${deviceZone}`)).toBeInTheDocument();
    expect(screen.getByText("Not set yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `Use ${deviceZone} for the account` }));
    expect(await screen.findByText(`Account: ${deviceZone}`)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(services.state.store.getState().settings.timezone).toBe(deviceZone);
  });

  it("offers a switch when the account zone differs from the device", async () => {
    const { services } = renderWithProviders(<TimezoneControl />);
    await services.state.dispatch({
      occurredAt: new Date().toISOString(),
      payload: { timezone: "Pacific/Chatham" },
      type: "settings.updated",
    });
    expect(await screen.findByText("Account: Pacific/Chatham")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Use ${deviceZone} for the account` }),
    ).toBeInTheDocument();
  });
});
