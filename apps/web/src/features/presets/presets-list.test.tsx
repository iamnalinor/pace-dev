import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";

import { PresetsList } from "./presets-list.tsx";

describe("PresetsList", () => {
  it("lists built-in and own presets with their badges, archived ones behind a filter", async () => {
    const { services } = await artboardServices();
    const { user } = renderWithProviders(<PresetsList />, { services });
    const list = await screen.findByRole("list", { name: "Presets" });
    const homework = within(list).getByText("Homework").closest("li")!;
    expect(homework).toHaveTextContent("Built-in");
    expect(within(list).queryByText("Inbox")).not.toBeInTheDocument();
    const algebra = within(list).getByRole("link", { name: /Algebra HW/ });
    expect(algebra).toHaveAttribute("href", "/settings/presets/hw.algebra");
    expect(algebra).toHaveTextContent("Yours");
    expect(
      screen.queryByRole("button", { name: "Add example course presets" }),
    ).not.toBeInTheDocument();

    await services.actions.archivePreset("hw.history");
    await waitFor(() => {
      expect(within(list).queryByText("History HW")).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("checkbox", { name: "Show archived" }));
    expect(within(list).getByRole("link", { name: /History HW/ })).toHaveTextContent("Archived");
  });

  it("starts a new preset from a base or from another preset", async () => {
    const { services } = await artboardServices();
    const { router, user } = renderWithProviders(<PresetsList />, { services });
    await user.selectOptions(await screen.findByLabelText("Start from"), "Algebra HW");
    await user.click(screen.getByRole("button", { name: "New preset" }));
    expect(router.state.location.pathname).toBe("/settings/presets/new");
    expect(router.state.location.search).toBe("?from=hw.algebra");
  });

  it("offers the example course presets until they exist", async () => {
    const { services, user } = renderWithProviders(<PresetsList />);
    await user.click(await screen.findByRole("button", { name: "Add example course presets" }));
    expect(await screen.findByRole("link", { name: /Calculus HW/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add example course presets" }),
    ).not.toBeInTheDocument();
    expect(services.state.store.getState().presets.byId["hw.algebra"]?.extends).toBe("hw");
  });
});
