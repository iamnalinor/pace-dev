import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";

import { InsightsScreen } from "./insights-screen.tsx";

const at = (hhmm: string): string => {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(2026, 9, 6, hours - 3, minutes)).toISOString();
};

describe("InsightsScreen", () => {
  it("shows where the week's time went by category and by project", async () => {
    const { services } = await artboardServices();
    const hw = Object.values(services.state.store.getState().tasks.byId).find((task) => task.title === "Algebra HW 6");
    await services.actions.startActivity({ category: "task", label: "Algebra HW 6", taskId: hw?.id }, { at: at("09:00") });
    await services.actions.startActivity({ category: "food", label: "Lunch" }, { at: at("11:00") });
    await services.actions.stopActivity({ at: at("11:30") });
    renderWithProviders(<InsightsScreen />, { services });
    expect(await screen.findByText("2h 30m tracked")).toBeInTheDocument();
    const byCategory = screen.getByRole("region", { name: "Time by category" });
    expect(within(byCategory).getAllByRole("listitem").map((row) => row.textContent)).toEqual(["Task2h", "Food30m"]);
    const byProject = screen.getByRole("region", { name: "Time by project" });
    expect(within(byProject).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      "Algebra2h",
      "No project30m",
    ]);
  });

  it("says when nothing was tracked", async () => {
    const { services } = await artboardServices();
    renderWithProviders(<InsightsScreen />, { services });
    expect(await screen.findByText("Nothing tracked this week yet.")).toBeInTheDocument();
  });
});
