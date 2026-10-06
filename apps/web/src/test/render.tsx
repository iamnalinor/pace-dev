import type { ReactElement } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";

/** Renders `ui` inside the same providers the app uses, with a fresh cache per test. */
export const renderWithProviders = (
  ui: ReactElement,
  options: { readonly route?: string } = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const router = createMemoryRouter([{ element: ui, path: "*" }], {
    initialEntries: [options.route ?? "/"],
  });
  return {
    queryClient,
    router,
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
};
