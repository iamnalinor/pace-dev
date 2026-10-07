import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";
import { createTestServices } from "#web/test/services.ts";
import { CALC_HW5_ID, INBOX_CABLE_ID } from "@pace/core/testing";
import { freezeAt, seedArtboard } from "#web/test/artboard-world.ts";
import { vi } from "vitest";

import { ReviewList } from "./review-list.tsx";

const setup = async () => {
  const { services } = createTestServices();
  await seedArtboard(services);
  return renderWithProviders(<ReviewList />, { services });
};

describe("ReviewList", () => {
  beforeEach(() => {
    freezeAt();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists the artboard's items oldest first with their action buttons", async () => {
    await setup();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    const [cable, calculus] = items;
    expect(cable).toHaveTextContent("Unsorted for too long");
    expect(cable).toHaveTextContent("кабель usb-c");
    expect(within(cable!).getByRole("button", { name: "Accept suggestion" })).toBeInTheDocument();
    expect(within(cable!).getByRole("button", { name: "Cancel task" })).toBeInTheDocument();
    expect(calculus).toHaveTextContent("The deadline passed. What happened?");
    expect(within(calculus!).getByRole("link", { name: "Calculus HW 5" })).toHaveAttribute(
      "href",
      `/task/${CALC_HW5_ID}`,
    );
    expect(within(calculus!).getByRole("button", { name: "Mark done" })).toBeInTheDocument();
    expect(within(calculus!).getByRole("button", { name: "Skipped" })).toBeInTheDocument();
  });

  it("runs the chosen action and drops the card", async () => {
    const { services, user } = await setup();
    const cable = (await screen.findAllByRole("listitem"))[0]!;
    await user.click(within(cable).getByRole("button", { name: "Cancel task" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
    const task = services.state.store.getState().tasks.byId[INBOX_CABLE_ID];
    expect(task?.closed?.outcome).toBe("cancelled");
  });

  it("keeps a task open without writing anything", async () => {
    const { services, user } = await setup();
    const calculus = (await screen.findAllByRole("listitem"))[1]!;
    const before = services.state.store.getState().events.length;
    await user.click(within(calculus).getByRole("button", { name: "Keep open" }));
    expect(await screen.findAllByRole("listitem")).toHaveLength(1);
    expect(services.state.store.getState().events).toHaveLength(before);
  });

  it("shows the empty line when there is nothing to sort", async () => {
    renderWithProviders(<ReviewList />);
    expect(await screen.findByText("Nothing to sort.")).toBeInTheDocument();
  });
});
