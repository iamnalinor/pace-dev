import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";

import { DayScreen } from "./day-screen.tsx";

/** Tuesday October 6, Moscow time (the artboard clock stands at 15:00). */
const at = (hhmm: string): string => {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, 6, hours - 3, minutes)).toISOString();
};

const setup = async () => {
  const { services } = await artboardServices();
  await services.actions.startActivity(
    { category: "work", label: "Deep work" },
    { at: at("09:00") },
  );
  await services.actions.startActivity({ category: "food", label: "Lunch" }, { at: at("12:30") });
  await services.actions.stopActivity({ at: at("13:00") });
  const view = renderWithProviders(<DayScreen />, { services });
  return { ...view, services };
};

describe("DayScreen", () => {
  it("shows the day's blocks, totals and the gaps between them", async () => {
    await setup();
    const list = await screen.findByRole("region", { name: "Day" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/9h not logged/u),
      expect.stringMatching(/09:00–12:30WorkDeep work3h 30m/u),
      expect.stringMatching(/12:30–13:00FoodLunch30m/u),
      expect.stringMatching(/2h not logged/u),
    ]);
    expect(screen.getByText("Tracked 4h")).toBeInTheDocument();
  });

  it("logs what filled a gap", async () => {
    const { services, user } = await setup();
    const gaps = await screen.findAllByRole("button", { name: "Log it" });
    const last = gaps.at(-1);
    if (last === undefined) {
      throw new Error("no gap to log");
    }
    await user.click(last);
    await user.type(await screen.findByRole("textbox", { name: "What" }), "Gym");
    await user.click(screen.getByRole("radio", { name: "Sport" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Gym")).toBeInTheDocument();
    expect(
      Object.values(services.state.store.getState().time.activities).find(
        (activity) => activity.label === "Gym",
      ),
    ).toMatchObject({
      category: "sport",
      endAt: at("15:00"),
      startAt: at("13:00"),
    });
  });

  it("renames a block", async () => {
    const { user } = await setup();
    await user.click(await screen.findByRole("button", { name: "Edit Lunch" }));
    const what = await screen.findByRole("textbox", { name: "What" });
    await user.clear(what);
    await user.type(what, "Обед с командой");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Обед с командой")).toBeInTheDocument();
  });
});
