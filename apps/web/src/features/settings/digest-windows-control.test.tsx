import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";

import { DigestWindowsControl } from "./digest-windows-control.tsx";

describe("DigestWindowsControl", () => {
  it("shows the account's digest times and saves a changed one", async () => {
    const { services } = renderWithProviders(<DigestWindowsControl />);
    const second = await screen.findByLabelText("Digest time 2");
    expect(screen.getByLabelText("Digest time 1")).toHaveValue("09:00");
    expect(second).toHaveValue("14:00");
    expect(screen.getByLabelText("Digest time 3")).toHaveValue("21:00");
    fireEvent.change(second, { target: { value: "15:30" } });
    expect(await screen.findByLabelText("Remove 15:30")).toBeInTheDocument();
    expect(services.state.store.getState().settings.digestWindows).toEqual([
      "09:00",
      "15:30",
      "21:00",
    ]);
  });

  it("removes and adds a time", async () => {
    const { services, user } = renderWithProviders(<DigestWindowsControl />);
    await user.click(await screen.findByRole("button", { name: "Remove 09:00" }));
    expect(await screen.findAllByLabelText(/Digest time/)).toHaveLength(2);
    expect(services.state.store.getState().settings.digestWindows).toEqual(["14:00", "21:00"]);
    await user.click(screen.getByRole("button", { name: "Add a time" }));
    expect(await screen.findAllByLabelText(/Digest time/)).toHaveLength(3);
    expect(services.state.store.getState().settings.digestWindows).toEqual([
      "14:00",
      "21:00",
      "12:00",
    ]);
  });

  it("ignores a cleared input", async () => {
    const { services } = renderWithProviders(<DigestWindowsControl />);
    const first = await screen.findByLabelText("Digest time 1");
    fireEvent.change(first, { target: { value: "" } });
    expect(services.state.store.getState().settings.digestWindows).toEqual([
      "09:00",
      "14:00",
      "21:00",
    ]);
  });
});
