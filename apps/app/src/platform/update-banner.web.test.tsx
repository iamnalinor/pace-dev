import { fireEvent, screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { UpdateCard } from "./update-banner.web.tsx";

describe("UpdateCard", () => {
  it("is one row: what happened and a single Refresh page button, nothing to postpone", async () => {
    const onRefresh = jest.fn();
    await renderScreen(<UpdateCard isWide onRefresh={onRefresh} />, await createTestRuntime());
    expect(screen.getByText(en("update.ready"))).toBeOnTheScreen();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Later")).toBeNull();
    expect(screen.queryByText("Refresh the page to get the latest fixes.")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: en("update.reload") }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("names its button Refresh page and says only that there is a new version", async () => {
    await renderScreen(
      <UpdateCard isWide={false} onRefresh={jest.fn()} />,
      await createTestRuntime(),
    );
    expect(en("update.reload")).toBe("Refresh page");
    expect(screen.getByText("New version")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Refresh page" })).toBeOnTheScreen();
  });
});
