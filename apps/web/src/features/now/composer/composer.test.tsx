import { screen, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { HW_ID, WORK_ID } from "@pace/core/testing";

import { Composer } from "./composer.tsx";

const setup = async (
  props: Parameters<typeof Composer>[0] = {},
  routes: Parameters<typeof artboardServices>[0] = {},
) => {
  const { services } = await artboardServices(routes);
  const view = renderWithProviders(
    <>
      <Toaster />
      <Composer {...props} />
    </>,
    { services },
  );
  return { ...view, services };
};

const line = () => screen.getByRole("textbox", { name: "New task" });
const tasks = (services: Awaited<ReturnType<typeof setup>>["services"]) =>
  Object.values(services.state.store.getState().tasks.byId);

describe("Composer", () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("shows how the line is read and adds the task with Enter", async () => {
    const { services, user } = await setup();
    await user.type(line(), "синк по дашборду завтра 15:00 1ч https://meet.example.com/abc");

    expect(screen.getByRole("radio", { name: "Work" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Normal" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Project" })).toHaveTextContent("Work");
    expect(screen.getByRole("button", { name: "Estimate" })).toHaveTextContent("1h");
    expect(screen.getByRole("button", { name: "Link" })).toHaveTextContent("meet.example.com");

    await user.keyboard("{Enter}");

    const created = tasks(services).find((task) => task.title === "синк по дашборду");
    expect(created).toMatchObject({ presetId: "work", projectId: WORK_ID, importance: "normal" });
    expect(line()).toHaveValue("");
  });

  it("changes the category with one tap and preselects its importance", async () => {
    const { user } = await setup();
    await user.type(line(), "renew the passport");
    await user.click(screen.getByRole("radio", { name: "Deferred" }));
    expect(screen.getByRole("radio", { name: "Nice-to-have" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "ASAP" }));
    expect(screen.getByRole("radio", { name: "ASAP" })).toBeChecked();
  });

  it("offers this week's homework as the target for typed problems", async () => {
    const { services, user } = await setup();
    await user.type(line(), "дз по алгебре 8, 9");
    const add = screen.getByRole("button", { name: "Add to Algebra HW 6" });
    await user.click(add);
    const labels = services.state.store.getState().tasks.byId[HW_ID]?.subtasks.map((s) => s.label);
    expect(labels?.slice(-2)).toEqual(["8", "9"]);
  });

  it("sends the raw line to Inbox", async () => {
    const { services, user } = await setup();
    await user.type(line(), "think about the trip");
    await user.click(screen.getByRole("button", { name: "To Inbox" }));
    expect(tasks(services).some((task) => task.title === "think about the trip")).toBe(true);
    expect(line()).toHaveValue("");
  });

  it("opens the project choices from its chip", async () => {
    const { user } = await setup();
    await user.type(line(), "draft notes");
    await user.click(screen.getByRole("button", { name: "Project" }));
    const projects = screen.getByRole("radiogroup", { name: "Project" });
    await user.click(within(projects).getByRole("radio", { name: "Work" }));
    expect(screen.getByRole("button", { name: "Project" })).toHaveTextContent("Work");
  });

  it("starts expanded and filled in from shared text", async () => {
    await setup({ initialText: "shared note", isInitiallyExpanded: true });
    expect(line()).toHaveValue("shared note");
    expect(screen.getByRole("textbox", { name: "Description" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fewer details" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("fills the chips from the assistant and marks what to check", async () => {
    const parsed = {
      doubtful: ["estimateMinutes"],
      isClean: false,
      provider: "fake",
      result: {
        category: "work",
        description: null,
        dueDate: null,
        dueTime: null,
        estimateMinutes: 90,
        evidence: [],
        importance: "asap",
        intent: "create_task",
        outcome: null,
        project: null,
        questions: [{ field: "dueDate", options: ["завтра"], question: "Когда сдать?" }],
        subtasks: [],
        task: null,
        title: "разобрать почту",
      },
      status: "parsed",
    };
    const { services, user } = await setup({}, { routes: { "POST /api/parse": () => parsed } });
    await user.type(line(), "срочно разобрать почту");
    await user.click(screen.getByRole("button", { name: "Read with AI" }));

    expect(await screen.findByText("Check: estimate")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Work" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "ASAP" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Estimate" })).toHaveTextContent("1h 30m");

    await user.click(line());
    await user.keyboard("{Enter}");
    expect(tasks(services).find((task) => task.title === "разобрать почту")).toMatchObject({
      estimateMinutes: 90,
      importance: "asap",
      presetId: "work",
      sourceText: "срочно разобрать почту",
    });
  });

  it("says when the assistant is out of requests and keeps the rule-based chips", async () => {
    const { user } = await setup(
      {},
      { routes: { "POST /api/parse": () => ({ retryAt: null, status: "unavailable" }) } },
    );
    await user.type(line(), "renew the passport");
    await user.click(screen.getByRole("button", { name: "Read with AI" }));
    expect(await screen.findByText(/out of requests for now/u)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Personal" })).toBeChecked();
  });
});
