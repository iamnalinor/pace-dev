import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";

import { AuthForm } from "./auth-form.tsx";

const { signInEmail, signUpEmail } = vi.hoisted(() => ({
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
}));
vi.mock("#web/shared/auth/auth-client.ts", () => ({
  authClient: { signIn: { email: signInEmail }, signUp: { email: signUpEmail } },
}));

const fillAndSubmit = async (user: ReturnType<typeof renderWithProviders>["user"]) => {
  await user.type(screen.getByLabelText("Email"), "alice@mail.test");
  await user.type(screen.getByLabelText("Password"), "correct horse");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
};

describe("AuthForm (sign-in)", () => {
  it("returns the user to the page they came from", async () => {
    signInEmail.mockResolvedValue({ data: {}, error: null });
    const { router, user } = renderWithProviders(<AuthForm mode="sign-in" />, {
      route: "/sign-in?next=%2Fposts%3Fpage%3D2",
    });

    await fillAndSubmit(user);

    expect(signInEmail).toHaveBeenCalledWith({
      email: "alice@mail.test",
      password: "correct horse",
    });
    expect(router.state.location.pathname + router.state.location.search).toBe("/posts?page=2");
  });

  it("shows the server's error and stays on the page", async () => {
    signInEmail.mockResolvedValue({ data: null, error: { message: "Invalid email or password" } });
    const { router, user } = renderWithProviders(<AuthForm mode="sign-in" />, {
      route: "/sign-in",
    });

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(router.state.location.pathname).toBe("/sign-in");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });
});

describe("AuthForm (sign-up)", () => {
  it("sends the name too and lands on the home page", async () => {
    signUpEmail.mockResolvedValue({ data: {}, error: null });
    const { router, user } = renderWithProviders(<AuthForm mode="sign-up" />, {
      route: "/sign-up",
    });

    await user.type(screen.getByLabelText("Name"), "Alice");
    await user.type(screen.getByLabelText("Email"), "alice@mail.test");
    await user.type(screen.getByLabelText("Password"), "correct horse");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(signUpEmail).toHaveBeenCalledWith({
      email: "alice@mail.test",
      name: "Alice",
      password: "correct horse",
    });
    expect(router.state.location.pathname).toBe("/");
  });
});
