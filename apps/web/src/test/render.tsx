import type { ReactElement } from "react";

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";

/** Renders `ui` inside a memory router, the way the app renders routes. */
export const renderWithProviders = (
  ui: ReactElement,
  options: { readonly route?: string } = {},
) => {
  const router = createMemoryRouter([{ element: ui, path: "*" }], {
    initialEntries: [options.route ?? "/"],
  });
  return { router, user: userEvent.setup(), ...render(<RouterProvider router={router} />) };
};
