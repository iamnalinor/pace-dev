import { screen } from "@testing-library/react";
import { Toaster } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Composer } from "#web/features/composer/composer.tsx";
import { artboardServices } from "#web/test/artboard-services.ts";
import { renderWithProviders } from "#web/test/render.tsx";
import { nowViewModel, queryContext } from "@pace/client";

import { Shortcuts } from "./shortcuts.tsx";

const setup = async () => {
  const { services } = await artboardServices();
  const rows = nowViewModel(services.state.store.getState(), queryContext(services.clock)).rows;
  const view = renderWithProviders(
    <>
      <Toaster />
      <Composer />
      <Shortcuts />
    </>,
    { services },
  );
  const path = () => view.router.state.location.pathname;
  return { ...view, path, rows };
};

describe("Shortcuts", () => {
  beforeEach(() => {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  it("walks the Now list with j and k", async () => {
    const { path, rows, user } = await setup();
    await user.keyboard("j");
    expect(path()).toBe(`/task/${rows[0]?.id ?? ""}`);
    await user.keyboard("j");
    expect(path()).toBe(`/task/${rows[1]?.id ?? ""}`);
    await user.keyboard("k");
    expect(path()).toBe(`/task/${rows[0]?.id ?? ""}`);
  });

  it("closes the pane with Escape", async () => {
    const { path, rows, user } = await setup();
    await user.keyboard("j");
    expect(path()).toBe(`/task/${rows[0]?.id ?? ""}`);
    await user.keyboard("{Escape}");
    expect(path()).toBe("/");
  });

  it("focuses the composer with n and ignores keys typed there", async () => {
    const { path, user } = await setup();
    await user.keyboard("n");
    const line = screen.getByRole("textbox", { name: "New task" });
    expect(line).toHaveFocus();
    await user.keyboard("jk");
    expect(line).toHaveValue("jk");
    expect(path()).toBe("/");
  });

  it("lists the shortcuts on ?", async () => {
    const { user } = await setup();
    await user.keyboard("?");
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("Mark the open task done")).toBeInTheDocument();
  });
});
