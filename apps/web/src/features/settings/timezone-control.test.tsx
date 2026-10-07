import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { frozenServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { MOSCOW } from "@pace/core/testing";

import { TimezoneControl } from "./timezone-control.tsx";

const setup = () => {
  const { services } = frozenServices({ deviceTz: MOSCOW });
  return renderWithProviders(<TimezoneControl />, { services });
};

describe("TimezoneControl", () => {
  it("shows the device zone as the account zone while the account has none", async () => {
    setup();
    expect(await screen.findByText(`Account: ${MOSCOW}`)).toBeInTheDocument();
    expect(screen.queryByText("Not set yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers a switch when the account zone differs from the device", async () => {
    const { services, user } = setup();
    await services.actions.setTimezone("Pacific/Chatham");
    expect(await screen.findByText("Account: Pacific/Chatham")).toBeInTheDocument();
    expect(screen.getByText("The account zone differs from this device.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `Use ${MOSCOW} for the account` }));
    expect(await screen.findByText(`Account: ${MOSCOW}`)).toBeInTheDocument();
  });

  it("does not nag when another name has the same offset", async () => {
    const { services } = setup();
    await services.actions.setTimezone("Europe/Minsk");
    expect(await screen.findByText("Account: Europe/Minsk")).toBeInTheDocument();
    expect(
      screen.queryByText("The account zone differs from this device."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Use ${MOSCOW} for the account` }),
    ).toBeInTheDocument();
  });
});
