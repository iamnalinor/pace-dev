import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";

import { QuietHoursControl } from "./quiet-hours-control.tsx";

describe("QuietHoursControl", () => {
  it("shows the account's quiet hours and saves a change", async () => {
    const { services } = renderWithProviders(<QuietHoursControl />);
    const from = await screen.findByLabelText("From");
    expect(from).toHaveValue("23:00");
    expect(screen.getByLabelText("To")).toHaveValue("08:00");
    fireEvent.change(from, { target: { value: "22:00" } });
    await vi.waitFor(() => {
      expect(services.state.store.getState().settings.quietHours).toEqual({
        from: "22:00",
        to: "08:00",
      });
    });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "" } });
    expect(services.state.store.getState().settings.quietHours.to).toBe("08:00");
  });
});
