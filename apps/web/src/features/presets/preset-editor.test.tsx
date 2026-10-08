import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artboardServices, frozenServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { MOSCOW } from "@pace/core/testing";

import { PresetEditor } from "./preset-editor.tsx";

const row = (name: string): HTMLElement => screen.getByRole("group", { name });

const newFromHw = () => {
  const { services } = frozenServices();
  return renderWithProviders(<PresetEditor from="hw" presetId={null} />, {
    route: "/settings/presets/new",
    services,
  });
};

describe("PresetEditor", () => {
  it("shows inherited values until a field is overridden, and saves only the overrides", async () => {
    const { router, services, user } = newFromHw();
    await user.type(await screen.findByLabelText("Name"), "Physics HW");
    expect(screen.getByLabelText("Id")).toHaveValue("physics-hw");
    const estimate = within(row("Default estimate (minutes)")).getByRole("spinbutton");
    expect(estimate).toBeDisabled();
    expect(estimate).toHaveValue(null);
    expect(estimate).toHaveAttribute("placeholder", "60");
    const policy = within(row("Urgency policy")).getByRole("combobox");
    expect(policy).toBeDisabled();
    expect(policy).toHaveValue("pace");

    await user.click(screen.getByRole("checkbox", { name: "Override: Urgency policy" }));
    expect(policy).toBeEnabled();
    await user.selectOptions(policy, "Resubmission");
    await user.click(
      screen.getByRole("checkbox", { name: "Override: Default estimate (minutes)" }),
    );
    // The input starts over from the inherited figure once the field is overridden.
    const overridden = within(row("Default estimate (minutes)")).getByRole("spinbutton");
    expect(overridden).toHaveValue(60);
    await user.clear(overridden);
    await user.type(overridden, "45");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/settings/presets");
    });
    expect(services.state.store.getState().presets.byId["physics-hw"]).toMatchObject({
      definition: { defaultEstimateMinutes: 45, urgencyPolicy: "resubmission" },
      extends: "hw",
      name: "Physics HW",
    });
  });

  it("maps validation errors to messages and marks the bad field", async () => {
    const { user } = newFromHw();
    await user.type(await screen.findByLabelText("Name"), "Lab");
    await user.clear(screen.getByLabelText("Id"));
    await user.type(screen.getByLabelText("Id"), "Bad Id");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Use a lowercase slug: letters, digits, '.' and '-'.",
    );
    await user.clear(screen.getByLabelText("Id"));
    await user.type(screen.getByLabelText("Id"), "lab");
    await user.click(
      screen.getByRole("checkbox", { name: "Override: Critical below progress (0–1)" }),
    );
    const progress = within(row("Critical below progress (0–1)")).getByRole("spinbutton");
    fireEvent.change(progress, { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Some values are not valid.");
    expect(
      within(row("Critical below progress (0–1)")).getByText("Check this value."),
    ).toBeInTheDocument();
    expect(progress).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects a parent that is one of the preset's own children", async () => {
    const { services } = await artboardServices();
    await services.actions.createPreset({
      definition: {},
      extends: "hw.algebra",
      id: "hw.algebra.honors",
      name: "Honors",
    });
    const { user } = renderWithProviders(<PresetEditor from={null} presetId="hw.algebra" />, {
      services,
    });
    expect(await screen.findByLabelText("Name")).toHaveValue("Algebra HW");
    expect(screen.getByLabelText("Id")).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Extends"), "Honors");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A preset cannot extend one of its own children.",
    );
  });

  it("edits the weekly schedule, says when the due falls the next week, and previews it", async () => {
    const { user } = newFromHw();
    await user.click(await screen.findByRole("checkbox", { name: "Override: Weekly schedule" }));
    await user.click(screen.getByRole("checkbox", { name: "Repeats every week" }));
    const schedule = row("Weekly schedule");
    await user.selectOptions(within(schedule).getByLabelText("Issued on"), "Thursday");
    fireEvent.change(within(schedule).getByLabelText("Issued at"), { target: { value: "09:00" } });
    await user.selectOptions(within(schedule).getByLabelText("Due on"), "Monday");
    expect(within(schedule).getByText("The due falls in the following week.")).toBeInTheDocument();
    expect(within(schedule).getByLabelText("Time zone")).toHaveValue(MOSCOW);
    await user.click(screen.getByRole("checkbox", { name: "Override: Default importance" }));
    await user.selectOptions(within(row("Default importance")).getByRole("combobox"), "ASAP");
    const preview = screen.getByRole("region", { name: "Preview" });
    expect(preview).toHaveTextContent("ASAP");
    expect(preview).toHaveTextContent(/Due Mon Oct 12 23:59/);
  });

  it("edits the resubmission deadline with its final date and zone", async () => {
    const { services, user } = newFromHw();
    await user.type(await screen.findByLabelText("Name"), "Geo");
    await user.click(screen.getByRole("checkbox", { name: "Override: Deadline" }));
    const deadline = row("Deadline");
    await user.selectOptions(
      within(deadline).getByRole("combobox", { name: "Deadline" }),
      "Resubmission",
    );
    const soft = within(deadline).getByLabelText("Soft days after the due");
    await user.clear(soft);
    await user.type(soft, "5");
    fireEvent.change(within(deadline).getByLabelText("Final deadline"), {
      target: { value: "2026-12-25T23:59" },
    });
    expect(within(deadline).getByText(`in ${MOSCOW}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(
        services.state.store.getState().presets.byId["geo"]?.definition.deadlinePolicy,
      ).toEqual({
        finalAt: "2026-12-25T20:59:00.000Z",
        finalTz: MOSCOW,
        kind: "resubmission",
        softDays: 5,
      });
    });
  });

  it("archives a preset and refuses to edit a built-in one", async () => {
    const { services } = await artboardServices();
    const { user } = renderWithProviders(<PresetEditor from={null} presetId="hw.history" />, {
      services,
    });
    await user.click(await screen.findByRole("button", { name: "Archive preset" }));
    await waitFor(() => {
      expect(services.state.store.getState().presets.byId["hw.history"]?.archived).toBe(true);
    });
  });

  it("refuses to edit a built-in preset or an unknown one", async () => {
    renderWithProviders(<PresetEditor from={null} presetId="hw" />);
    expect(await screen.findByText(/A default preset keeps its id/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New preset from Homework" })).toHaveAttribute(
      "href",
      "/settings/presets/new?from=hw",
    );
  });
});
