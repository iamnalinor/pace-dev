import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import {
  ALGEBRA_ID,
  INBOX_CABLE_ID,
  INBOX_GRADE_ID,
  INBOX_SYNC_ID,
  INBOX_TEXTS,
  MOSCOW,
  WORK_ID,
} from "@pace/core/testing";

import { InboxView } from "./inbox-view.tsx";

const cardsNow = () => within(screen.getByRole("list", { name: "Inbox" })).getAllByRole("listitem");

const expectCards = async (count: number): Promise<void> => {
  await waitFor(() => {
    expect(cardsNow()).toHaveLength(count);
  });
};

const setup = async () => {
  const { services } = await artboardServices();
  const rendered = renderWithProviders(
    <>
      <Toaster />
      <InboxView />
    </>,
    { services },
  );
  const cards = within(await screen.findByRole("list", { name: "Inbox" })).getAllByRole("listitem");
  const task = (id: string) => services.state.store.getState().tasks.byId[id];
  return { ...rendered, cards, task };
};

describe("InboxView", () => {
  beforeEach(() => {
    // sonner captures the pointer for its swipe-to-dismiss; jsdom has no pointer capture.
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("shows the count, the hint and each capture verbatim with its age and chips", async () => {
    const { cards } = await setup();
    expect(screen.getByRole("heading", { level: 1, name: "Inbox" })).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/Everything here counts as Nice-to-have/)).toBeInTheDocument();
    expect(cards).toHaveLength(3);
    const [cable, grade, sync] = cards;
    const text = within(cable!).getByText(INBOX_TEXTS[INBOX_CABLE_ID]);
    expect(text).not.toHaveAttribute("lang");
    expect(cable).toHaveTextContent("6d · unsorted too long");
    expect(grade).toHaveTextContent("2d");
    expect(sync).toHaveTextContent("5h");
    const chips = within(sync!)
      .getAllByRole("button", { name: /tap to change/ })
      .map((chip) => chip.textContent);
    expect(chips).toEqual(["Work", "Work", "Due Friday 23:59", "Prioritized"]);
    expect(
      within(cable!).getByRole("button", { name: "Project: No project, tap to change" }),
    ).toBeInTheDocument();
    expect(
      within(cable!).getByRole("button", { name: "Due: No deadline, tap to change" }),
    ).toBeInTheDocument();
  });

  it("accepts a suggestion with the fields changed through the chips", async () => {
    const { cards, task, user } = await setup();
    const sync = cards[2]!;
    await user.click(
      within(sync).getByRole("button", { name: "Importance: Prioritized, tap to change" }),
    );
    await user.click(within(sync).getByRole("radio", { name: "ASAP" }));
    expect(
      within(sync).getByRole("button", { name: "Importance: ASAP, tap to change" }),
    ).toBeInTheDocument();
    await user.click(
      within(sync).getByRole("button", { name: "Due: Due Friday 23:59, tap to change" }),
    );
    const due = within(sync).getByLabelText("Due");
    expect(due).toHaveValue("2026-10-09T23:59");
    expect(within(sync).getByText(`in ${MOSCOW}`)).toBeInTheDocument();
    fireEvent.change(due, { target: { value: "2026-10-08T18:00" } });
    await user.click(within(sync).getByRole("button", { name: "Accept" }));
    await expectCards(2);
    expect(task(INBOX_SYNC_ID)).toMatchObject({
      dueAt: "2026-10-08T15:00:00.000Z",
      dueTz: MOSCOW,
      importance: "asap",
      presetId: "work",
      projectId: WORK_ID,
    });
  });

  it("moves a capture to another project and preset, or drops its deadline", async () => {
    const { cards, task, user } = await setup();
    const cable = cards[0]!;
    await user.click(
      within(cable).getByRole("button", { name: "Project: No project, tap to change" }),
    );
    await user.click(
      within(within(cable).getByRole("radiogroup", { name: "Project" })).getByRole("radio", {
        name: "Algebra",
      }),
    );
    await user.click(
      within(cable).getByRole("button", { name: "Preset: Personal, tap to change" }),
    );
    await user.click(within(cable).getByRole("radio", { name: "Algebra HW" }));
    expect(
      within(cable).getByRole("button", { name: "Preset: Algebra HW, tap to change" }),
    ).toBeInTheDocument();
    await user.click(within(cable).getByRole("button", { name: "Accept" }));
    expect(task(INBOX_CABLE_ID)).toMatchObject({ presetId: "hw.algebra", projectId: ALGEBRA_ID });

    const sync = cardsNow()[1]!;
    await user.click(
      within(sync).getByRole("button", { name: "Due: Due Friday 23:59, tap to change" }),
    );
    await user.click(within(sync).getByRole("button", { name: "No deadline" }));
    expect(
      within(sync).getByRole("button", { name: "Due: No deadline, tap to change" }),
    ).toBeInTheDocument();
  });

  it("deletes a capture and brings it back with Undo", async () => {
    const { cards, user } = await setup();
    await user.click(
      within(cards[1]!).getByRole("button", { name: `Delete ${INBOX_TEXTS[INBOX_GRADE_ID]}` }),
    );
    await expectCards(2);
    expect(screen.queryByText(INBOX_TEXTS[INBOX_GRADE_ID])).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await expectCards(3);
  });

  it("accepts every card at once", async () => {
    const { task, user } = await setup();
    await user.click(screen.getByRole("button", { name: "Accept all" }));
    expect(await screen.findByText("Nothing to sort.")).toBeInTheDocument();
    expect(task(INBOX_GRADE_ID)?.projectId).toBe(ALGEBRA_ID);
    expect(task(INBOX_CABLE_ID)?.presetId).toBe("personal");
  });

  it("captures a thought exactly as typed, Russian included, on Enter", async () => {
    const { services, user } = await setup();
    const input = screen.getByRole("textbox", { name: "Quick capture" });
    await user.type(input, "  купить Молоко  {Enter}");
    expect(input).toHaveValue("");
    const created = services.state.store.getState().events.at(-1);
    expect(created).toMatchObject({
      payload: { presetId: "inbox", sourceText: "  купить Молоко  ", title: "  купить Молоко  " },
      type: "task.created",
    });
    await expectCards(4);
    await user.type(input, "   {Enter}");
    expect(services.state.store.getState().events.at(-1)).toBe(created);
  });
});
