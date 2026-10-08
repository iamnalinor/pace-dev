import { screen, waitFor, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { artboardServices, frozenServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { CALC_HW5_ID, HW_ID, REPLY_ID, TRK_ID, WORK_ID } from "@pace/core/testing";

import { NowScreen } from "./now-screen.tsx";

const renderBoard = async () => {
  const { services } = await artboardServices();
  return renderWithProviders(
    <>
      <Toaster />
      <NowScreen />
    </>,
    { services },
  );
};

const board = () => screen.getByRole("list", { name: "Tasks" });
const titles = () =>
  within(board())
    .getAllByRole("listitem")
    .map((item) => within(item).getByTestId("task-title").textContent);

describe("NowScreen", () => {
  beforeEach(() => {
    // sonner captures the pointer for its swipe-to-dismiss; jsdom has no pointer capture.
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("draws the artboard header: the date, the inbox counter and the idle time bar", async () => {
    await renderBoard();
    expect(await screen.findByRole("heading", { name: "Now" })).toBeInTheDocument();
    expect(screen.getByText("Tue · Oct 6")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inbox, 3 unsorted" })).toHaveAttribute(
      "href",
      "/inbox",
    );
    expect(screen.getByText("Nothing running. Tap an activity to start it.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "To sort · 2" })).toHaveAttribute("href", "/review");
  });

  it("lists the artboard rows in score order with their meta lines", async () => {
    await renderBoard();
    await screen.findByRole("list", { name: "Tasks" });
    expect(titles()).toEqual([
      "Calculus HW 5",
      "Reply to course curator",
      "Flaky latency test in nightly",
      "Algebra HW 6",
      "Return library books",
    ]);
    const meta = (title: string) =>
      screen.getAllByRole("link").find((link) => link.textContent.startsWith(title))?.textContent;
    expect(meta("Calculus HW 5")).toContain("1 day late · 2 problems left");
    expect(meta("Reply to course curator")).toMatch(/PersonalASAPby end of day/u);
    expect(meta("Algebra HW 6")).toContain("Due tomorrow 23:59 · 4/7 solved · 2 sent");
    expect(meta("Return library books")).toMatch(/Nice-to-have12 days old/u);
    expect(meta("Flaky latency test in nightly")).toMatch(
      /WorkPrioritizedDue Friday 18:00 (?:UTC|GMT) \(your time 21:00\)/,
    );
    expect(screen.getByText("1 day late")).toHaveClass("text-warn");
    expect(screen.getByText("ASAP")).toHaveClass("font-medium");
  });

  it("unfolds the waiting tasks from the footer", async () => {
    const { user } = await renderBoard();
    const footer = await screen.findByRole("button", { name: "+ 6 later · 2 waiting" });
    expect(footer).toHaveAttribute("aria-expanded", "false");
    await user.click(footer);
    const waiting = screen.getByRole("region", { name: "Waiting" });
    expect(within(waiting).getByText("Prepare demo for Friday")).toBeInTheDocument();
    expect(within(waiting).getByText("RFC: dedicated runner pool")).toBeInTheDocument();
    await user.click(footer);
    expect(screen.queryByRole("region", { name: "Waiting" })).not.toBeInTheDocument();
  });

  it("filters by project through the URL", async () => {
    const { router, user } = await renderBoard();
    const chips = await screen.findByRole("navigation", { name: "Filter by project" });
    await user.click(within(chips).getByRole("button", { name: "Work" }));
    expect(router.state.location.search).toBe(`?project=${WORK_ID}`);
    expect(within(chips).getByRole("button", { name: "Work" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await waitFor(() => {
      expect(titles()).toEqual(["Flaky latency test in nightly"]);
    });
    await user.click(within(chips).getByRole("button", { name: "All" }));
    expect(router.state.location.search).toBe("");
    await waitFor(() => {
      expect(titles()).toHaveLength(5);
    });
  });

  it("checks a task off at once and brings it back with Undo", async () => {
    const { services, user } = await renderBoard();
    await user.click(
      await screen.findByRole("button", { name: "Mark Reply to course curator done" }),
    );
    await waitFor(() => {
      expect(titles()).not.toContain("Reply to course curator");
    });
    expect(services.state.store.getState().tasks.byId[REPLY_ID]?.closed?.outcome).toBe("done");
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(titles()).toContain("Reply to course curator");
    });
  });

  it("opens the close sheet of a per-problem task instead of closing it", async () => {
    const { router, user } = await renderBoard();
    await user.click(await screen.findByRole("button", { name: "Mark Algebra HW 6 done" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/task/${HW_ID}`);
    });
    expect(router.state.location.search).toBe("?close=1");
  });

  it("moves a task up within its importance with the keyboard", async () => {
    // jsdom has no layout: give every row of a list a 60px slot so the sensor can measure.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      /* eslint-disable testing-library/no-node-access -- jsdom has no layout: the mock places each row by its index */
      const item = this.closest("li");
      const index = item === null ? 0 : [...(item.parentElement?.children ?? [])].indexOf(item);
      /* eslint-enable testing-library/no-node-access -- end of the layout mock */
      return DOMRect.fromRect({ height: 60, width: 390, x: 0, y: index * 60 });
    });
    const { services, user } = await renderBoard();
    const handle = await screen.findByRole("button", { name: "Reorder Algebra HW 6" });
    expect(handle).toHaveAttribute("aria-roledescription", "sortable");
    handle.focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    await user.keyboard(" ");
    await waitFor(() => {
      expect(services.state.store.getState().tasks.byId[HW_ID]?.rank).toBe(1);
    });
    expect(services.state.store.getState().tasks.byId[CALC_HW5_ID]?.rank).toBe(2);
    expect(services.state.store.getState().tasks.byId[TRK_ID]?.rank).toBe(2);
  });

  it("says so when there is nothing to do", async () => {
    renderWithProviders(<NowScreen />, { services: frozenServices().services });
    expect(await screen.findByText("Nothing to do right now.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Filter by project" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /To sort/ })).not.toBeInTheDocument();
  });
});
