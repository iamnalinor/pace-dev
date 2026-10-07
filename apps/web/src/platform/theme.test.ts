import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applyTheme,
  readThemePreference,
  setThemePreference,
  useThemePreference,
} from "./theme.ts";

describe("theme preference", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset["theme"];
  });

  afterEach(() => {
    delete document.documentElement.dataset["theme"];
  });

  it("defaults to system when nothing is stored", () => {
    expect(readThemePreference()).toBe("system");
  });

  it("persists the preference and reads it back", () => {
    setThemePreference("dark");
    expect(readThemePreference()).toBe("dark");
  });

  it("ignores garbage in storage", () => {
    localStorage.setItem("pace.theme", "neon");
    expect(readThemePreference()).toBe("system");
  });

  it("sets data-theme on <html> for an explicit theme", () => {
    applyTheme("light");
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("removes data-theme for system", () => {
    applyTheme("dark");
    applyTheme("system");
    expect(document.documentElement.dataset["theme"]).toBeUndefined();
  });

  it("applies the stored preference when called without an argument", () => {
    setThemePreference("dark");
    applyTheme();
    expect(document.documentElement.dataset["theme"]).toBe("dark");
  });
});

describe("useThemePreference", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset["theme"];
  });

  it("keeps every subscriber in sync when one of them changes the theme", () => {
    const first = renderHook(() => useThemePreference());
    const second = renderHook(() => useThemePreference());
    act(() => {
      first.result.current[1]("light");
    });
    expect(second.result.current[0]).toBe("light");
    expect(document.documentElement.dataset["theme"]).toBe("light");
    expect(readThemePreference()).toBe("light");
  });
});
