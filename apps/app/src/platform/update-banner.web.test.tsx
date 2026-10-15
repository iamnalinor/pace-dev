import { fireEvent, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { UpdateFrame, UpdateStrip } from "./update-banner.web.tsx";

describe("UpdateStrip", () => {
  it("says what happened and offers a single Refresh button, nothing to postpone", async () => {
    const onRefresh = jest.fn();
    await renderScreen(<UpdateStrip onRefresh={onRefresh} />, await createTestRuntime());
    expect(screen.getByText("We changed a few things. Refresh to see them.")).toBeOnTheScreen();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Later")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("has an English source copy", () => {
    expect(en("update.message")).toBe("We changed a few things. Refresh to see them.");
    expect(en("update.refresh")).toBe("Refresh");
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
  it("shows no strip while no new build waits, and the screens keep the status bar's room", async () => {
    await renderFrame(false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByTestId("top-inset")).toHaveTextContent("47");
  });

  it("takes the status bar's room itself once open, so the screens below do not pad it twice", async () => {
    await renderFrame(true);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeOnTheScreen();
    expect(screen.getByTestId("top-inset")).toHaveTextContent("0");
  });
});
