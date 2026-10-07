import { screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { HW_ID, REPLY_ID } from "@pace/core/testing";

import { useCompleteTask } from "./use-complete-task.ts";

const Probe = ({ id, title }: { readonly id: string; readonly title: string }) => {
  const complete = useCompleteTask();
  return (
    <button
      onClick={() => {
        void complete({ id, title });
      }}
      type="button"
    >
      check
    </button>
  );
};

describe("useCompleteTask", () => {
  beforeEach(() => {
    // sonner captures the pointer for its swipe-to-dismiss; jsdom has no pointer capture.
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("closes a whole task as done at once and offers to undo it", async () => {
    const { services } = await artboardServices();
    const { user } = renderWithProviders(
      <>
        <Toaster />
        <Probe id={REPLY_ID} title="Reply to course curator" />
      </>,
      { services },
    );
    await user.click(screen.getByRole("button", { name: "check" }));
    const task = () => services.state.store.getState().tasks.byId[REPLY_ID];
    expect(task()?.closed?.outcome).toBe("done");
    expect(await screen.findByText("Reply to course curator · done")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(task()?.closed).toBeNull();
    });
  });

  it("sends a per-problem task to its close sheet instead", async () => {
    const { services } = await artboardServices();
    const { router, user } = renderWithProviders(<Probe id={HW_ID} title="Algebra HW 6" />, {
      services,
    });
    await user.click(screen.getByRole("button", { name: "check" }));
    await waitFor(() => {
      expect(`${router.state.location.pathname}${router.state.location.search}`).toBe(
        `/task/${HW_ID}?close=1`,
      );
    });
    expect(services.state.store.getState().tasks.byId[HW_ID]?.closed).toBeNull();
  });

  it("reports a task that is gone", async () => {
    const { services } = await artboardServices();
    const { user } = renderWithProviders(
      <>
        <Toaster />
        <Probe id="t-nope" title="Nope" />
      </>,
      { services },
    );
    await user.click(screen.getByRole("button", { name: "check" }));
    expect(await screen.findByText("That task does not exist anymore.")).toBeInTheDocument();
  });
});
