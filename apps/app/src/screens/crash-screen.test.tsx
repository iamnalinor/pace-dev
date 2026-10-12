import { render, screen } from "@testing-library/react-native";

import { en } from "#app/test/render.tsx";
import { ThemeProvider } from "#app/ui/theme-provider.tsx";

import { CrashScreen } from "./crash-screen.tsx";

const mockSaveCrashTrace = jest.fn<null | string, [string]>();

jest.mock("../../modules/pace-native/index.ts", () => ({
  paceNative: { saveCrashTrace: (trace: string) => mockSaveCrashTrace(trace) },
}));

// What Hermes hands the boundary: the stack starts with the message.
const failure = (): Error => ({
  message: "undefined is not a function",
  name: "TypeError",
  stack: "TypeError: undefined is not a function\n    at TaskRow (1:2345)",
});

// As the root layout's ErrorBoundary shows it.
const renderCrash = async () =>
  await render(
    <ThemeProvider>
      <CrashScreen error={failure()} />
    </ThemeProvider>,
  );

beforeEach(() => {
  mockSaveCrashTrace.mockReset();
});

describe("CrashScreen", () => {
  it("saves the error with its stack and says where", async () => {
    mockSaveCrashTrace.mockReturnValue("Download/Pace/crash-2026-10-12-19-07-23.txt");
    await renderCrash();
    expect(mockSaveCrashTrace).toHaveBeenCalledWith(expect.stringContaining("at TaskRow (1:2345)"));
    expect(
      await screen.findByText(
        en("crash.savedAt", { path: "Download/Pace/crash-2026-10-12-19-07-23.txt" }),
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText("undefined is not a function")).toBeOnTheScreen();
  });

  it("shows the message alone where nothing can be saved (the web)", async () => {
    mockSaveCrashTrace.mockReturnValue(null);
    await renderCrash();
    expect(screen.getByText("undefined is not a function")).toBeOnTheScreen();
    expect(screen.queryByText(/Download\/Pace/u)).toBeNull();
  });
});
