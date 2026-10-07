import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { PaceProvider } from "#web/app-state.tsx";
import { createTestServices } from "#web/test/services.ts";

import { NotFoundPage, RouteError } from "./route-error.tsx";

const Boom = () => {
  throw new Error("history view exploded");
};

const renderAt = (path: string) => {
  const { services } = createTestServices();
  const router = createMemoryRouter(
    [
      { element: <Boom />, errorElement: <RouteError />, path: "/boom" },
      { element: <NotFoundPage />, path: "*" },
    ],
    { initialEntries: [path] },
  );
  render(
    <PaceProvider services={services}>
      <RouterProvider router={router} />
    </PaceProvider>,
  );
};

describe("RouteError", () => {
  it("says what crashed instead of a bare 'something went wrong'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderAt("/boom");
    expect(await screen.findByRole("heading", { name: "This screen crashed" })).toBeInTheDocument();
    expect(screen.getByText("Error: history view exploded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("names the missing address on an unknown route", async () => {
    renderAt("/nowhere");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("There is nothing at /nowhere.")).toBeInTheDocument();
  });
});
