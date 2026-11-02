import { screen } from "@testing-library/react-native";

import { renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { fakeMe } from "@pace/client/testing";

import { UserAvatar } from "./user-avatar.tsx";

const avatarFor = async (name: string) => {
  const runtime = await createTestRuntime({
    routes: { "GET /api/me": () => ({ ...fakeMe, name }) },
    world: "empty",
  });
  await runtime.auth.adoptToken("session-avatar");
  await renderScreen(<UserAvatar />, runtime);
};

describe("UserAvatar", () => {
  it("shows the first letters of the first two words", async () => {
    await avatarFor("Albert Nalinor");
    expect(screen.getByText("AN")).toBeOnTheScreen();
  });

  it("shows an emoji-first name's emoji whole, never half of it (F-DAT-08)", async () => {
    await avatarFor("\u{1F98A} Лиса");
    expect(screen.getByText("\u{1F98A}")).toBeOnTheScreen();
    expect(screen.queryByText(/[\uD800-\uDFFF]$/u)).not.toBeOnTheScreen();
  });

  it("draws the person icon when the name has no letter to show", async () => {
    await avatarFor("123");
    expect(screen.getByTestId("avatar-person")).toBeOnTheScreen();
  });
});
