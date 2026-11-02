import { renderHook } from "@testing-library/react-native";

import { useThemePreference } from "./theme.ts";

jest.mock("./theme-stored.ts", () => ({ storedThemePreference: () => "light" }));

describe("the theme preference at the first render", () => {
  // The web build reads localStorage at once (theme-stored.web.ts), so the root view paints the
  // person's theme in its first frame, not the OS's until the async store answers (F-WEB-02).
  it("is the one the platform already knows, not `system` until the store answers", async () => {
    const firstFrame: string[] = [];
    await renderHook(() => {
      const handle = useThemePreference();
      firstFrame.push(`${handle.preference}/${handle.scheme}`);
      return handle;
    });
    expect(firstFrame[0]).toBe("light/light");
  });
});
