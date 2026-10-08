import { act, fireEvent, screen } from "@testing-library/react";
import { Toaster } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";

import { TimeBar } from "./time-bar.tsx";

const setup = async () => {
  const { services } = await artboardServices();
  const view = renderWithProviders(
    <>
      <Toaster />
      <TimeBar />
    </>,
    { services },
  );
  return { ...view, services };
};

const running = (services: Awaited<ReturnType<typeof setup>>["services"]) =>
  Object.values(services.state.store.getState().time.activities).filter((activity) => activity.endAt === null);

describe("TimeBar", () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts an activity with one tap and stops it with a second", async () => {
    const { services, user } = await setup();
    await user.click(screen.getByRole("button", { name: "Work" }));
    expect(running(services).map((activity) => activity.label)).toEqual(["Work"]);
    expect(await screen.findByRole("button", { name: "Work", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Food" }));
    expect(running(services).map((activity) => activity.label)).toEqual(["Food"]);
    expect(await screen.findByText(/of ~30m/u)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Food" }));
    expect(running(services)).toEqual([]);
  });

  it("opens the editor on press and hold and saves the new defaults", async () => {
    const { services, user } = await setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const commute = screen.getByRole("button", { name: "Commute" });
    fireEvent.pointerDown(commute, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    fireEvent.pointerUp(commute);
    vi.useRealTimers();
    const name = await screen.findByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Метро");
    await user.clear(screen.getByRole("spinbutton", { name: /Expect/u }));
    await user.type(screen.getByRole("spinbutton", { name: /Expect/u }), "35");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Метро" })).toBeInTheDocument();
    expect(services.state.store.getState().time.buttons["btn:commute"]).toMatchObject({
      expectMinutes: 35,
      label: "Метро",
    });
    expect(running(services)).toEqual([]);
  });

  it("adds a button from the plus", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Add activity" }));
    await user.type(await screen.findByRole("textbox", { name: "Name" }), "Reading");
    await user.click(screen.getByRole("radio", { name: "Study" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: "Reading" })).toBeInTheDocument();
  });
});
