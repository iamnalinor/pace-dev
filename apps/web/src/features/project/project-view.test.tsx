import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { at } from "#web/test/at.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import {
  ALGEBRA_ID,
  CALC_HW5_ID,
  CALC_W41_ID,
  CALCULUS_ID,
  HW_ID,
  sheetId,
} from "@pace/core/testing";

import { ProjectView } from "./project-view.tsx";

const setup = async (projectId: string) => {
  const { services } = await artboardServices();
  return renderWithProviders(<ProjectView projectId={projectId} />, { services });
};

describe("ProjectView", () => {
  it("shows the Algebra header, stats, weekly bars and open rows like Now", async () => {
    await setup(ALGEBRA_ID);
    expect(await screen.findByRole("heading", { level: 1, name: "Algebra" })).toBeInTheDocument();
    const stats = screen.getByRole("region", { name: "Stats" });
    expect(within(stats).getByRole("group", { name: "Open" })).toHaveTextContent("2");
    expect(within(stats).getByRole("group", { name: "On time" })).toHaveTextContent("9/11");
    expect(within(stats).getByRole("group", { name: "Late" })).toHaveTextContent("2");
    expect(within(stats).getByRole("group", { name: "This wk" })).toHaveTextContent("0:00");
    expect(
      within(stats).getByRole("img", { name: "Hours per week, last 6 weeks: 0, 0, 0, 0, 0, 0" }),
    ).toBeInTheDocument();
    const open = screen.getByRole("list", { name: "Open" });
    const rows = within(open).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(at(rows, 0)).getByRole("link", { name: /Algebra HW 6/ })).toHaveAttribute(
      "href",
      `/task/${HW_ID}`,
    );
    expect(rows[0]).toHaveTextContent("Due tomorrow 23:59 · 1d 8h left · 4/7 solved · 2 sent");
  });

  it("lists done tasks newest first with their outcome, folded after five", async () => {
    const { user } = await setup(ALGEBRA_ID);
    const done = await screen.findByRole("list", { name: "Done" });
    expect(within(done).getAllByRole("listitem")).toHaveLength(5);
    expect(within(done).getAllByRole("listitem")[0]).toHaveTextContent("Algebra sheet 11");
    await user.click(screen.getByRole("button", { name: "All 11 done →" }));
    const all = within(done).getAllByRole("listitem");
    expect(all).toHaveLength(11);
    const late = all.find((item) => item.textContent.includes("Algebra sheet 3"));
    expect(late).toHaveTextContent("Done late");
    expect(screen.getByRole("link", { name: "Algebra sheet 3" })).toHaveAttribute(
      "href",
      `/task/${sheetId(3)}`,
    );
    await user.click(screen.getByRole("button", { name: "Show fewer ←" }));
    expect(within(done).getAllByRole("listitem")).toHaveLength(5);
  });

  it("puts an empty recurring instance under awaiting assignment with a way to add problems", async () => {
    await setup(CALCULUS_ID);
    const open = await screen.findByRole("list", { name: "Open" });
    expect(within(open).getByRole("link", { name: /Calculus HW 5/ })).toHaveAttribute(
      "href",
      `/task/${CALC_HW5_ID}`,
    );
    expect(within(open).getByText(/15h 1m late/)).toBeInTheDocument();
    const awaiting = screen.getByRole("list", { name: "Awaiting assignment" });
    expect(awaiting).toHaveTextContent("Calculus HW 6");
    expect(awaiting).toHaveTextContent("Due Mon Oct 12 23:59");
    expect(
      within(awaiting).getByRole("link", { name: "Add problems to Calculus HW 6" }),
    ).toHaveAttribute("href", `/task/${CALC_W41_ID}`);
  });

  it("edits the name, color and description, then archives", async () => {
    const { services, user } = await setup(ALGEBRA_ID);
    await user.click(await screen.findByRole("button", { name: "Edit project" }));
    const name = screen.getByLabelText("Project name");
    await user.clear(name);
    await user.type(name, "Linear algebra");
    await user.click(screen.getByRole("radio", { name: "Teal" }));
    await user.type(screen.getByLabelText("Description"), "Weekly sheets, due Wednesday");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Linear algebra" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Weekly sheets, due Wednesday")).toBeInTheDocument();
    const project = () => services.state.store.getState().projects.byId[ALGEBRA_ID];
    expect(project()).toMatchObject({
      color: "teal",
      description: "Weekly sheets, due Wednesday",
      name: "Linear algebra",
    });
    await user.click(screen.getByRole("button", { name: "Edit project" }));
    await user.click(screen.getByRole("button", { name: "Archive project" }));
    expect(await screen.findByText("Archived")).toBeInTheDocument();
    expect(project()?.archived).toBe(true);
    await user.click(screen.getByRole("button", { name: "Edit project" }));
    await user.click(screen.getByRole("button", { name: "Restore project" }));
    expect(project()?.archived).toBe(false);
  });

  it("refuses an empty name and says when the project does not exist", async () => {
    const { user } = await setup(ALGEBRA_ID);
    await user.click(await screen.findByRole("button", { name: "Edit project" }));
    await user.clear(screen.getByLabelText("Project name"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the project a name.");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { level: 1, name: "Algebra" })).toBeInTheDocument();
  });

  it("says when the project does not exist", async () => {
    await setup("p-nope");
    expect(await screen.findByText("Project not found.")).toBeInTheDocument();
  });
});
