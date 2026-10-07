import { fireEvent, screen, waitFor } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";
import { ALGEBRA_ID, HW_ID, INBOX_CABLE_ID, INBOX_TEXTS } from "@pace/core/testing";

import { HistoryScreen } from "./history-screen.tsx";
import { InboxScreen } from "./inbox-screen.tsx";
import { ProjectScreen } from "./project-screen.tsx";
import { ProjectsScreen } from "./projects-screen.tsx";
import { ReviewScreen } from "./review-screen.tsx";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("InboxScreen", () => {
  it("shows each capture verbatim with its guess and sorts it with one tap", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<InboxScreen />, runtime);
    expect(screen.getByText(INBOX_TEXTS[INBOX_CABLE_ID])).toBeOnTheScreen();
    const [accept] = screen.getAllByRole("button", { name: en("common.accept") });
    if (accept === undefined) {
      throw new Error("no Accept button");
    }
    await fireEvent.press(accept);
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: en("common.accept") })).toHaveLength(2);
    });
  });
});

describe("ReviewScreen", () => {
  it("lists what waits for a decision", async () => {
    await renderScreen(<ReviewScreen />, await createTestRuntime());
    expect(screen.getByRole("header", { name: en("review.title") })).toBeOnTheScreen();
    expect(screen.getByText("Calculus HW 5")).toBeOnTheScreen();
  });
});

describe("ProjectsScreen and ProjectScreen", () => {
  it("lists the projects and opens one", async () => {
    await renderScreen(<ProjectsScreen />, await createTestRuntime());
    await fireEvent.press(screen.getByRole("link", { name: "Algebra" }));
    expect(router.push).toHaveBeenCalledWith(`/project/${ALGEBRA_ID}`);
  });

  it("shows a project's figures and open tasks", async () => {
    await renderScreen(<ProjectScreen id={ALGEBRA_ID} />, await createTestRuntime());
    expect(screen.getByRole("header", { name: "Algebra" })).toBeOnTheScreen();
    expect(screen.getByLabelText(`${en("project.stat.onTime")}: 9/11`)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Algebra HW 6"));
    expect(router.push).toHaveBeenCalledWith(`/task/${HW_ID}`);
  });
});

describe("HistoryScreen", () => {
  it("shows the board and the events, each undoable", async () => {
    await renderScreen(<HistoryScreen />, await createTestRuntime());
    expect(screen.getByRole("header", { name: en("history.title") })).toBeOnTheScreen();
    expect(screen.getAllByRole("button", { name: en("common.undo") }).length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: en("history.dayBack") }));
    expect(screen.getByText(en("history.boardAt"))).toBeOnTheScreen();
  });
});
