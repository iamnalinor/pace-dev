import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";

import { TabBar } from "./tab-bar.tsx";

describe("TabBar", () => {
  it("marks the current route's tab as the current page", async () => {
    renderWithProviders(<TabBar />, { route: "/day" });
    expect(await screen.findByRole("link", { name: "Day" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Now" })).not.toHaveAttribute("aria-current");
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("treats the index route as Now only", () => {
    renderWithProviders(<TabBar />, { route: "/" });
    expect(screen.getByRole("link", { name: "Now" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Projects" })).not.toHaveAttribute("aria-current");
  });

  it("navigates when a tab is clicked", async () => {
    const { router, user } = renderWithProviders(<TabBar />, { route: "/" });
    await user.click(screen.getByRole("link", { name: "Projects" }));
    expect(router.state.location.pathname).toBe("/projects");
  });
});
