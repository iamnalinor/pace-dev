import { fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { UpdateCard, UpdateFrame } from "./update-banner.web.tsx";

describe("UpdateCard", () => {
  it("says what happened and offers a single Refresh button, nothing to postpone", async () => {
    const onRefresh = jest.fn();
    await renderScreen(<UpdateCard onRefresh={onRefresh} />, await createTestRuntime());
    expect(screen.getByText("A new version of Pace is ready.")).toBeOnTheScreen();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Later")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Refresh page" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("has an English source copy", () => {
    expect(en("update.message")).toBe("A new version of Pace is ready.");
    expect(en("update.refresh")).toBe("Refresh page");
  });
});

const TopInset = () => <Text testID="top-inset">{useSafeAreaInsets().top}</Text>;

const renderFrame = async (isOpen: boolean) =>
  await renderScreen(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 0, left: 0, right: 0, top: 47 },
      }}
    >
      <UpdateFrame isOpen={isOpen} onRefresh={jest.fn()}>
        <TopInset />
      </UpdateFrame>
    </SafeAreaProvider>,
    await createTestRuntime(),
  );

describe("UpdateFrame", () => {
  it("shows no card while no new build waits", async () => {
    await renderFrame(false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("top-inset")).toHaveTextContent("47");
  });

  it("lays the card over the app and pushes nothing: the screens keep their own room (F-WEB-07)", async () => {
    await renderFrame(true);
    expect(screen.getByRole("button", { name: "Refresh page" })).toBeOnTheScreen();
    expect(screen.getByTestId("top-inset")).toHaveTextContent("47");
    // The card is the frame's last child, drawn over the app, and takes no touches beside itself.
    const card = screen.getByTestId("update-card");
    expect(card).toBeOnTheScreen();
  });
});
