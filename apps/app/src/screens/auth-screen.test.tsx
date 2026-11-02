import type * as ReactNativeActual from "react-native";

import { render, screen, waitFor } from "@testing-library/react-native";

import type * as CoreActual from "@pace/core";

import { fakeUser } from "@pace/client/testing";
import { err, ok, t } from "@pace/core";

import { ThemeProvider } from "../ui/theme-provider.tsx";
import { AuthScreen } from "./auth-screen.tsx";

const renderLanding = async () =>
  await render(
    <ThemeProvider>
      <AuthScreen />
    </ThemeProvider>,
  );

const mockRouter = { replace: jest.fn<undefined, [string]>() };
const mockState = { status: "signed-out" as "signed-in" | "signed-out" };
const mockAuth = {
  adoptToken: jest.fn(),
  store: { getState: () => ({ status: mockState.status, user: null }) },
};

jest.mock("expo-router", () => {
  const { Text } = jest.requireActual<typeof ReactNativeActual>("react-native");
  const Redirect = ({ href }: { readonly href: string }) => <Text testID="redirect">{href}</Text>;
  return {
    Redirect,
    useLocalSearchParams: () => ({ token: "tok_link" }),
    useRouter: () => mockRouter,
  };
});

jest.mock("../app-state.tsx", () => {
  const { t: mockT } = jest.requireActual<typeof CoreActual>("@pace/core");
  return {
    useAuth: () => ({
      auth: mockAuth,
      endedElsewhere: false,
      status: mockState.status,
      user: null,
    }),
    useT: () => (key: Parameters<typeof mockT>[1]) => mockT("en", key),
  };
});

afterEach(() => {
  mockRouter.replace.mockClear();
  mockAuth.adoptToken.mockReset();
  mockState.status = "signed-out";
});

describe("AuthScreen", () => {
  it("goes home once the link's token is adopted", async () => {
    mockAuth.adoptToken.mockResolvedValue(ok(fakeUser));
    await renderLanding();
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/");
    });
  });

  it("says the link is invalid when the server refuses its token", async () => {
    mockAuth.adoptToken.mockResolvedValue(err("auth/unauthorized"));
    await renderLanding();
    expect(await screen.findByText(t("en", "auth.invalidLink"))).toBeOnTheScreen();
  });

  it("settles silently when another sign-in took the device meanwhile (fix round 2 of QA 18)", async () => {
    // The link's check was answered after a newer session began: nothing about the link was
    // wrong, and the device is signed in under that newer session.
    mockAuth.adoptToken.mockImplementation(async () => {
      mockState.status = "signed-in";
      return err("session/changed");
    });
    await renderLanding();
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/");
    });
    expect(screen.queryByText(t("en", "auth.invalidLink"))).toBeNull();
  });

  it("goes to the login when the device signed out meanwhile, without calling the link invalid", async () => {
    mockAuth.adoptToken.mockResolvedValue(err("session/changed"));
    await renderLanding();
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith("/login");
    });
    expect(screen.queryByText(t("en", "auth.invalidLink"))).toBeNull();
  });
});
