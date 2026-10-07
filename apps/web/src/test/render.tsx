import type { ReactElement } from "react";

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";

import { PaceProvider } from "#web/app-state.tsx";

import { createTestServices } from "./services.ts";

type Options = {
  readonly route?: string;
  readonly services?: ReturnType<typeof createTestServices>["services"];
};

/** Renders `ui` inside the app providers and a memory router, the way the app renders routes. */
export const renderWithProviders = (ui: ReactElement, options: Options = {}) => {
  const services = options.services ?? createTestServices().services;
  const router = createMemoryRouter([{ element: ui, path: "*" }], {
    initialEntries: [options.route ?? "/"],
  });
  return {
    router,
    services,
    user: userEvent.setup(),
    ...render(
      <PaceProvider services={services}>
        <RouterProvider router={router} />
      </PaceProvider>,
    ),
  };
};
