import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react-native";
import { Alert, Share } from "react-native";

import { SettingsScreen } from "#app/screens/settings-screen.tsx";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import type * as PaceNativeModule from "../../../modules/pace-native/index.ts";

import { CrashScreen } from "./crash-screen.tsx";
import { useCrashNotice } from "./use-crash-notice.ts";

const mockLog = { text: "", unseen: "" };
const mockAppend = jest.fn<undefined, [string, string]>();

jest.mock("../../../modules/pace-native/index.ts", () => {
  const { fallbackPaceNative } = jest.requireActual<typeof PaceNativeModule>(
    "../../../modules/pace-native/index.ts",
  );
  return {
    paceNative: {
      ...fallbackPaceNative,
      appendCrashReport: (kind: string, details: string) => {
        mockAppend(kind, details);
      },
      clearCrashLog: () => {
        mockLog.text = "";
      },
      readCrashLog: () => mockLog.text,
      takeUnseenCrashes: () => {
        const { unseen } = mockLog;
        mockLog.unseen = "";
        return unseen;
      },
    },
  };
});

const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  mockLog.text = "";
  mockLog.unseen = "";
});

describe("CrashScreen", () => {
  it("shows the error, logs it, and offers a reload and the report", async () => {
    const error = new TypeError("undefined is not a function");
    const retry = jest.fn(async () => undefined);
    await render(<CrashScreen error={error} retry={retry} />);
    expect(screen.getByText(en("errors.crashTitle"))).toBeOnTheScreen();
    expect(screen.getByText(/TypeError: undefined is not a function/u)).toBeOnTheScreen();
    expect(mockAppend).toHaveBeenCalledWith("render", expect.stringContaining("TypeError"));
    await fireEvent.press(screen.getByRole("button", { name: en("errors.reload") }));
    expect(retry).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: en("crash.share") }));
    expect(share).toHaveBeenCalledWith({
      message: expect.stringContaining("undefined is not a function") as string,
    });
  });
});

describe("useCrashNotice", () => {
  it("says once that the app crashed and offers the report", async () => {
    mockLog.unseen = "=== js-fatal\nTypeError: boom";
    await renderHook(() => {
      useCrashNotice();
    });
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((button) => button.text === en("crash.share"))?.onPress?.();
    expect(share).toHaveBeenCalledWith({ message: "=== js-fatal\nTypeError: boom" });
  });

  it("stays quiet when nothing crashed", async () => {
    await renderHook(() => {
      useCrashNotice();
    });
    expect(alert).not.toHaveBeenCalled();
  });
});

describe("Settings → Crash log", () => {
  it("is hidden while the log is empty", async () => {
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    expect(screen.queryByText(en("settings.crashLog"))).toBeNull();
  });

  it("shows the log, shares it and clears it", async () => {
    mockLog.text = "=== android\njava.lang.IllegalStateException: boom\n";
    await renderScreen(<SettingsScreen />, await createTestRuntime({ world: "empty" }));
    expect(screen.getByText(/IllegalStateException: boom/u)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: en("crash.share") }));
    expect(share).toHaveBeenCalledWith({ message: mockLog.text });
    await fireEvent.press(screen.getByRole("button", { name: en("settings.crashLog.clear") }));
    await waitFor(() => {
      expect(screen.queryByText(en("settings.crashLog"))).toBeNull();
    });
  });
});
