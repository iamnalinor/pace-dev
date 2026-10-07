import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { ALGEBRA_ID } from "@pace/core/testing";

import { ProjectsList } from "./projects-list.tsx";

const setup = async () => {
  const { services } = await artboardServices();
  return renderWithProviders(<ProjectsList />, { services });
};

describe("ProjectsList", () => {
  it("lists the projects by name with their open count and on-time ratio", async () => {
    await setup();
    const list = await screen.findByRole("list", { name: "Projects" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Algebra"),
      expect.stringContaining("Calculus"),
      expect.stringContaining("Work"),
    ]);
    expect(links[0]).toHaveTextContent("2 open");
    expect(links[0]).toHaveTextContent("9/11 on time");
    expect(links[0]).toHaveAttribute("href", `/projects/${ALGEBRA_ID}`);
    expect(links[1]).not.toHaveTextContent("on time");
  });

  it("creates a project inline with a name and a color", async () => {
    const { services, user } = await setup();
    await user.click(await screen.findByRole("button", { name: "New project" }));
    await user.type(screen.getByLabelText("Project name"), "  Thesis ");
    await user.click(screen.getByRole("radio", { name: "Coral" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    const link = await screen.findByRole("link", { name: /Thesis/ });
    expect(link).toHaveTextContent("0 open");
    const created = Object.values(services.state.store.getState().projects.byId).find(
      (project) => project.name === "Thesis",
    );
    expect(created?.color).toBe("coral");
    expect(screen.queryByLabelText("Project name")).not.toBeInTheDocument();
  });

  it("refuses an empty or taken name", async () => {
    const { services, user } = await setup();
    await user.click(await screen.findByRole("button", { name: "New project" }));
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the project a name.");
    await user.type(screen.getByLabelText("Project name"), "algebra");
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A project with this name already exists.");
    expect(Object.keys(services.state.store.getState().projects.byId)).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Project name")).not.toBeInTheDocument();
  });

  it("shows the empty line without projects", async () => {
    renderWithProviders(<ProjectsList />);
    expect(await screen.findByText("No projects yet.")).toBeInTheDocument();
  });
});
