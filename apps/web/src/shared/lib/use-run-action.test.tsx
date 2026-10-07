import { screen, waitFor } from "@testing-library/react";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useServices } from "#web/app-state.tsx";
import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { REPLY_ID } from "@pace/core/testing";

import { useRunAction } from "./use-run-action.ts";

const Probe = ({ taskId }: { readonly taskId: string }) => {
  const { actions } = useServices();
  const run = useRunAction();
  return (
    <button
      onClick={() => {
        void run(actions.setStatus(taskId, "waiting"), { undo: "Waiting now" });
      }}
      type="button"
    >
      go
    </button>
  );
};

describe("useRunAction", () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("toasts what happened with an Undo that revokes exactly those events", async () => {
    const { services } = await artboardServices();
    const { user } = renderWithProviders(
      <>
        <Toaster />
        <Probe taskId={REPLY_ID} />
      </>,
      { services },
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    const status = () => services.state.store.getState().tasks.byId[REPLY_ID]?.status;
    expect(status()).toBe("waiting");
    expect(await screen.findByText("Waiting now")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => {
      expect(status()).not.toBe("waiting");
    });
  });

  it("toasts the translated error instead", async () => {
    const { services } = await artboardServices();
    const { user } = renderWithProviders(
      <>
        <Toaster />
        <Probe taskId="t-nope" />
      </>,
      { services },
    );
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(
      await screen.findByText(/That task does not exist anymore|Could not apply/),
    ).toBeInTheDocument();
  });
});
