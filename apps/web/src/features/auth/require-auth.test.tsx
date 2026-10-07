import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";
import { createTestServices, signedInSession } from "#web/test/services.ts";

import { RequireAuth } from "./require-auth.tsx";

const App = () => (
  <Routes>
    <Route element={<RequireAuth />}>
      <Route element={<p>Private</p>} path="/private" />
    </Route>
    <Route element={<p>Login</p>} path="/login" />
  </Routes>
);

describe("RequireAuth", () => {
  it("redirects signed-out visitors to /login keeping ?next=", async () => {
    const { router } = renderWithProviders(<App />, { route: "/private?tab=2" });
    expect(await screen.findByText("Login")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe("?next=%2Fprivate%3Ftab%3D2");
  });

  it("renders the child route once signed in", async () => {
    const { services } = createTestServices({ session: await signedInSession() });
    renderWithProviders(<App />, { route: "/private", services });
    await waitFor(() => {
      expect(screen.getByText("Private")).toBeInTheDocument();
    });
  });
});
