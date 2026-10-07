import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { artboardServices, frozenServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { HW_ID, MOSCOW } from "@pace/core/testing";

import { AddForm } from "./add-form.tsx";

const lastTask = (services: Awaited<ReturnType<typeof artboardServices>>["services"]) => {
  const event = services.state.store
    .getState()
    .events.findLast((item) => item.type === "task.created");
  return event?.type === "task.created"
    ? services.state.store.getState().tasks.byId[event.payload.taskId]
    : undefined;
};

describe("AddForm", () => {
  it("adds a task with a project made on the fly and a due in the zone it shows", async () => {
    const { services } = await artboardServices();
    const { router, user } = renderWithProviders(<AddForm />, { route: "/add", services });
    await user.type(await screen.findByLabelText("Paste or type anything"), "Write the report");
    await user.selectOptions(screen.getByLabelText("Goes to"), "Work");
    await user.type(screen.getByLabelText("Project"), "Thesis");
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2026-10-09T18:00" } });
    expect(screen.getByText(`in ${MOSCOW}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/task\//);
    });
    const task = lastTask(services);
    expect(task).toMatchObject({
      dueAt: "2026-10-09T15:00:00.000Z",
      dueTz: MOSCOW,
      presetId: "work",
      title: "Write the report",
    });
    const project = services.state.store.getState().projects.byId[task?.projectId ?? ""];
    expect(project?.name).toBe("Thesis");
    expect(router.state.location.pathname).toBe(`/task/${task?.id ?? ""}`);
  });

  it("lets the due use the device zone when the account sits elsewhere", async () => {
    const { services } = frozenServices({ deviceTz: MOSCOW });
    await services.actions.setTimezone("America/New_York");
    const { user } = renderWithProviders(<AddForm />, { services });
    await user.type(await screen.findByLabelText("Paste or type anything"), "Call");
    fireEvent.change(screen.getByLabelText("Due"), { target: { value: "2026-10-09T18:00" } });
    expect(screen.getByText("in America/New_York")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: `This device (${MOSCOW})` }));
    expect(screen.getByText(`in ${MOSCOW}`)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(lastTask(services)).toMatchObject({
        dueAt: "2026-10-09T15:00:00.000Z",
        dueTz: MOSCOW,
      });
    });
  });

  it("sends the problems of a recurring preset to its open instance", async () => {
    const { services } = await artboardServices();
    const { router, user } = renderWithProviders(<AddForm />, { services });
    await user.selectOptions(await screen.findByLabelText("Goes to"), "Algebra HW");
    const target = screen.getByRole("radiogroup", { name: "Instance" });
    expect(within(target).getByRole("radio", { name: /Algebra HW 6 · this week/ })).toBeChecked();
    await user.type(screen.getByLabelText("Add problems"), "8, 9{Enter}");
    expect(screen.getByRole("button", { name: "Remove problem 9" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to Algebra HW 6" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/task/${HW_ID}`);
    });
    const labels = services.state.store
      .getState()
      .tasks.byId[HW_ID]?.subtasks.map((item) => item.label);
    expect(labels?.slice(-2)).toEqual(["8", "9"]);
  });

  it("can make a separate task with a recurring preset, and needs problems for an instance", async () => {
    const { services } = await artboardServices();
    const { user } = renderWithProviders(<AddForm />, { services });
    await user.selectOptions(await screen.findByLabelText("Goes to"), "Algebra HW");
    await user.click(screen.getByRole("button", { name: "Add to Algebra HW 6" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one problem.");
    await user.click(screen.getByRole("radio", { name: "A new task" }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the task a title.");
  });

  it("files the text into the inbox exactly as typed", async () => {
    const { services } = await artboardServices();
    const { router, user } = renderWithProviders(<AddForm />, { route: "/add", services });
    await user.type(
      await screen.findByLabelText("Paste or type anything"),
      "ДЗ 7 по алгебре: 1, 3",
    );
    await user.click(screen.getByRole("button", { name: "To Inbox" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/inbox");
    });
    expect(lastTask(services)).toMatchObject({
      presetId: "inbox",
      sourceText: "ДЗ 7 по алгебре: 1, 3",
    });
  });

  it("shows the fields the preset asks for", async () => {
    const { services } = await artboardServices();
    const { user } = renderWithProviders(<AddForm />, { services });
    expect(await screen.findByLabelText("Description")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ticket")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Goes to"), "Work");
    await user.type(screen.getByLabelText("Paste or type anything"), "Fix flaky test");
    await user.type(screen.getByLabelText("Ticket"), "TRK-300");
    await user.selectOptions(screen.getByLabelText("Importance"), "Prioritized");
    await user.click(screen.getByRole("radio", { name: "2h" }));
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => {
      expect(lastTask(services)).toMatchObject({
        estimateMinutes: 120,
        fields: { ticket: "TRK-300" },
        importance: "prioritized",
        title: "Fix flaky test",
      });
    });
  });
});
