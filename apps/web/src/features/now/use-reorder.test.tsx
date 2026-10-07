import { screen } from "@testing-library/react";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useServices } from "#web/app-state.tsx";
import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { HW_ID, REPLY_ID } from "@pace/core/testing";

import { useReorder } from "./use-reorder.ts";

const Probe = ({ active, over }: { readonly active: string; readonly over: null | string }) => {
  const { rows } = useServices().hooks.useNow();
  const reorder = useReorder(rows);
  return (
    <button
      onClick={() => {
        void reorder(active, over);
      }}
      type="button"
    >
      drop
    </button>
  );
};

describe("useReorder", () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("explains that a task cannot leave its importance and writes nothing", async () => {
    const { services } = await artboardServices();
    const before = services.state.store.getState().log.length;
    const { user } = renderWithProviders(
      <>
        <Toaster />
        <Probe active={HW_ID} over={REPLY_ID} />
      </>,
      { services },
    );
    await user.click(screen.getByRole("button", { name: "drop" }));
    expect(await screen.findByText("Tasks move only within their importance.")).toBeInTheDocument();
    expect(services.state.store.getState().log).toHaveLength(before);
  });

  it("ignores a drop outside the board", async () => {
    const { services } = await artboardServices();
    const before = services.state.store.getState().log.length;
    const { user } = renderWithProviders(<Probe active={HW_ID} over={null} />, { services });
    await user.click(screen.getByRole("button", { name: "drop" }));
    expect(services.state.store.getState().log).toHaveLength(before);
  });
});
