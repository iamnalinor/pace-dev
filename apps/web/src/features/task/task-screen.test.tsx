import { screen, waitFor, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { describe, expect, it } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { at } from "#web/test/at.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import {
  BOOKS_ID,
  CALC_HW5_ID,
  HW_ID,
  HW_VIEW_NOW,
  INBOX_GRADE_ID,
  INBOX_TEXTS,
  MOSCOW,
  sheetId,
  TRK_ID,
  TRK_NOW,
} from "@pace/core/testing";

import { TaskScreen } from "./task-screen.tsx";

type Options = { readonly now?: string; readonly deviceTz?: string; readonly route?: string };

const renderTask = async (taskId: string, options: Options = {}) => {
  const { route, ...clock } = options;
  const { services } = await artboardServices({ now: HW_VIEW_NOW, ...clock });
  return renderWithProviders(
    <>
      <Toaster />
      <TaskScreen taskId={taskId} />
    </>,
    { route: route ?? `/task/${taskId}`, services },
  );
};

const task = (services: Awaited<ReturnType<typeof renderTask>>["services"], id: string) =>
  services.state.store.getState().tasks.byId[id];

describe("TaskScreen — Algebra HW 6 (per problem)", () => {
  it("shows the header, tags, stats and problems of the artboard", async () => {
    await renderTask(HW_ID);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Algebra HW 6" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Project: Algebra. Change" })).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.getByText("Submit per problem")).toBeInTheDocument();
    expect(screen.getByText("today 23:59")).toBeInTheDocument();
    expect(screen.getByText("~1h 43m")).toBeInTheDocument();
    expect(screen.getByText("82% of window gone")).toBeInTheDocument();
    expect(screen.getByText("4 solved · 2 sent")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Sent" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Submit 3 and 4" })).toBeInTheDocument();
  });

  it("toggles a problem between solved and not", async () => {
    const { services, user } = await renderTask(HW_ID);
    await user.click(await screen.findByRole("button", { name: "Mark Kronecker–Capelli solved" }));
    const solvedAt = () =>
      task(services, HW_ID)?.subtasks.find((item) => item.id === "s5")?.solvedAt;
    expect(solvedAt()).not.toBeNull();
    expect(screen.getByText("5 solved · 2 sent")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kronecker–Capelli solved, tap to undo" }));
    await waitFor(() => {
      expect(solvedAt()).toBeNull();
    });
  });

  it("submits the solved problems an hour ago, about then, from the sheet a check opened", async () => {
    const { router, services, user } = await renderTask(HW_ID, { route: `/task/${HW_ID}?close=1` });
    const sheet = await screen.findByRole("dialog", { name: "Submit 3 and 4" });
    expect(within(sheet).getByText("Algebra HW 6 · marked solved")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "At deadline" })).toBeDisabled();
    expect(within(sheet).getByText("Done · before deadline")).toBeInTheDocument();
    expect(within(sheet).getByText("5, 6, 7a Bonus")).toBeInTheDocument();
    expect(within(sheet).getByText("12:50 · happened 12:50")).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "1h ago" }));
    expect(within(sheet).getByText("12:50 · happened 11:50")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("switch", { name: "Exact time" }));
    await user.click(within(sheet).getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const sent = task(services, HW_ID)?.subtasks.filter((item) => item.submittedAt !== null);
    expect(sent?.map((item) => item.id)).toEqual(["s1", "s2", "s3", "s4"]);
    const event = services.state.store.getState().log.at(-1);
    expect(event).toMatchObject({
      occurredAt: "2026-10-07T08:50:00.000Z",
      precision: "approx",
      type: "task.submitted",
    });
    expect(router.state.location.search).toBe("");
    expect(await screen.findByText("Algebra HW 6 · 2 sent")).toBeInTheDocument();
  });

  it("reads an exact time in the account zone and refuses an unreadable one", async () => {
    const { user } = await renderTask(HW_ID);
    await user.click(await screen.findByRole("button", { name: "Submit 3 and 4" }));
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "Pick exact time" }));
    const input = within(sheet).getByLabelText("Pick exact time", { selector: "input" });
    expect(input).toHaveValue("2026-10-07T12:50");
    expect(within(sheet).getByText(`Times are read in ${MOSCOW}`)).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "2026-10-07T09:15");
    expect(within(sheet).getByText(/happened 09:15/)).toBeInTheDocument();
    await user.clear(input);
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Use the date as YYYY-MM-DD");
    expect(within(sheet).getByRole("button", { name: "Submit" })).toBeDisabled();
  });
});

describe("TaskScreen — closing", () => {
  it("previews a late close and closes as cancelled with the reason as typed", async () => {
    const { services, user } = await renderTask(CALC_HW5_ID, {
      route: `/task/${CALC_HW5_ID}?close=1`,
    });
    const sheet = await screen.findByRole("dialog", { name: "Close task" });
    expect(within(sheet).getByText("Done · late")).toBeInTheDocument();
    await user.click(
      within(sheet).getByRole("button", { name: "Close task as… Cancelled · Skipped" }),
    );
    await user.type(within(sheet).getByLabelText("Reason"), "курс отменили");
    await user.click(within(sheet).getByRole("button", { name: "Cancelled" }));
    await waitFor(() => {
      expect(task(services, CALC_HW5_ID)?.closed).toMatchObject({
        outcome: "cancelled",
        reason: "курс отменили",
      });
    });
    expect(
      await screen.findByText("Closed · Cancelled · Reason: курс отменили"),
    ).toBeInTheDocument();
  });

  it("shows a closed task's outcome and reopens it", async () => {
    const { services, user } = await renderTask(sheetId(3));
    expect(await screen.findByText("Closed · Done late")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => {
      expect(task(services, sheetId(3))?.closed).toBeNull();
    });
  });
});

describe("TaskScreen — TRK-231 (progress slider)", () => {
  it("explains its place on Now and moves the slider", async () => {
    const { services, user } = await renderTask(TRK_ID, { deviceTz: "UTC", now: TRK_NOW });
    expect(await screen.findByRole("link", { name: /tracker\.example\.com/ })).toHaveAttribute(
      "href",
      "https://tracker.example.com/browse/TRK-231",
    );
    expect(
      screen.getByText("p99 check fails ~1 in 5 runs on the shared runner."),
    ).toBeInTheDocument();
    expect(screen.getByText("4 / 10")).toBeInTheDocument();
    expect(screen.getByText("pace says 6.5 by now")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /^Why it's/ });
    await user.click(toggle);
    const card = screen.getByRole("region", { name: toggle.textContent.replace(" →", "") });
    const valueOf = (label: string) => {
      const index = within(card)
        .getAllByRole("term")
        .findIndex((term) => term.textContent === label);
      return at(within(card).getAllByRole("definition"), index);
    };
    expect(valueOf("Window elapsed")).toHaveTextContent("65%");
    expect(valueOf("Behind pace")).toHaveTextContent("+0.25");
    expect(valueOf("Prioritized")).toHaveTextContent("× 5");
    expect(valueOf("Your rank in Prioritized")).toHaveTextContent("2 of 3");

    const slider = screen.getByRole("slider", { name: "Progress, 0 to 10" });
    slider.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(task(services, TRK_ID)?.slider).toBe(5);
    });
  });

  it("puts a task on hold and resumes it", async () => {
    const { services, user } = await renderTask(TRK_ID, { deviceTz: "UTC", now: TRK_NOW });
    await user.click(await screen.findByRole("button", { name: "Waiting" }));
    expect(task(services, TRK_ID)?.status).toBe("waiting");
    await user.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() => {
      expect(task(services, TRK_ID)?.status).toBe("in_progress");
    });
  });
});

describe("TaskScreen — menu", () => {
  it("edits the due in its zone and refuses an unknown zone", async () => {
    const { services, user } = await renderTask(HW_ID);
    await user.click(await screen.findByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit task" });
    const zone = within(sheet).getByLabelText("Time zone");
    await user.clear(zone);
    await user.type(zone, "Mars/Olympus");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Unknown time zone");
    expect(task(services, HW_ID)?.dueTz).toBe(MOSCOW);

    await user.clear(zone);
    await user.type(zone, MOSCOW);
    const due = within(sheet).getByLabelText("Due");
    await user.clear(due);
    await user.type(due, "2026-10-08T12:00");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(task(services, HW_ID)).toMatchObject({
        dueAt: "2026-10-08T09:00:00.000Z",
        dueTz: MOSCOW,
      });
    });
    expect(await screen.findByText("Task updated")).toBeInTheDocument();
  });

  it("switches the preset and moves the task out of its project", async () => {
    const { services, user } = await renderTask(HW_ID);
    await user.click(await screen.findByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("button", { name: "Change preset" }));
    await user.click(await screen.findByRole("button", { name: /^Work/ }));
    await waitFor(() => {
      expect(task(services, HW_ID)?.presetId).toBe("work");
    });
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("button", { name: "Move to project" }));
    await user.click(await screen.findByRole("button", { name: "No project" }));
    await waitFor(() => {
      expect(task(services, HW_ID)?.projectId).toBeNull();
    });
  });

  it("deletes an untouched task by taking its creation back", async () => {
    const { router, services, user } = await renderTask(BOOKS_ID);
    await user.click(await screen.findByRole("button", { name: "More" }));
    await user.click(await screen.findByRole("button", { name: "Delete task" }));
    const sheet = await screen.findByRole("dialog", { name: "Delete Return library books?" });
    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(task(services, BOOKS_ID)).toBeUndefined();
  });
});

describe("TaskScreen — edges", () => {
  it("keeps the source message verbatim", async () => {
    const { user } = await renderTask(INBOX_GRADE_ID);
    await user.click(await screen.findByRole("button", { name: "Original message ↓" }));
    expect(screen.getByRole("blockquote")).toHaveTextContent(INBOX_TEXTS[INBOX_GRADE_ID]);
  });

  it("says when the task does not exist", async () => {
    await renderTask("t-nope");
    expect(await screen.findByText("This task does not exist.")).toBeInTheDocument();
  });
});

describe("TaskScreen — focus", () => {
  it("starts time on the task with Focus and stops it with a second tap", async () => {
    const { services, user } = await renderTask(HW_ID);
    await user.click(await screen.findByRole("button", { name: "Focus" }));
    const running = () =>
      Object.values(services.state.store.getState().time.activities).filter(
        (activity) => activity.endAt === null,
      );
    expect(running()).toEqual([expect.objectContaining({ category: "task", taskId: HW_ID })]);
    await user.click(await screen.findByRole("button", { name: "Focusing", pressed: true }));
    expect(running()).toEqual([]);
  });
});
