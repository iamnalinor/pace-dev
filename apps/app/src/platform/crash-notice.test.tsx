import { screen } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { useCrashNotice } from "./crash-notice.ts";

const mockTakeLastCrash = jest.fn<null | string, []>();

jest.mock("../../modules/pace-native/index.ts", () => ({
  paceNative: { takeLastCrash: () => mockTakeLastCrash() },
}));

const Probe = () => {
  useCrashNotice();
  return null;
};

describe("useCrashNotice", () => {
  it("says where the last crash's trace was saved", async () => {
    mockTakeLastCrash.mockReturnValueOnce("Download/Pace/crash-2026-10-12-19-07-23.txt");
    await renderScreen(<Probe />, await createTestRuntime());
    expect(
      await screen.findByText(
        en("crash.saved", { path: "Download/Pace/crash-2026-10-12-19-07-23.txt" }),
      ),
    ).toBeOnTheScreen();
  });

  it("stays quiet after a start without a crash", async () => {
    mockTakeLastCrash.mockReturnValueOnce(null);
    await renderScreen(<Probe />, await createTestRuntime());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
