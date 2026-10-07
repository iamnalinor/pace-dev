import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { frozenServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { HW_DUE, MOSCOW } from "@pace/core/testing";

import { ZonedTime } from "./zoned-time.tsx";

describe("ZonedTime", () => {
  it("shows the due in its own zone and the viewer's time when the zones differ", async () => {
    const { services } = frozenServices();
    renderWithProviders(<ZonedTime at={HW_DUE} deviceTz="UTC" mode="due" tz={MOSCOW} />, {
      services,
    });
    const time = await screen.findByText(/tomorrow 23:59 .+ \(your time 20:59\)/);
    expect(time).toHaveAttribute("datetime", HW_DUE);
  });

  it("shows only the time when the zones agree", async () => {
    const { services } = frozenServices();
    renderWithProviders(<ZonedTime at={HW_DUE} deviceTz={MOSCOW} mode="datetime" tz={MOSCOW} />, {
      services,
    });
    expect(await screen.findByText("Oct 7, 23:59")).toBeInTheDocument();
  });
});
