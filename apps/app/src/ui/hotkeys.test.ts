import {
  ariaHotkey,
  canFireWhileTyping,
  formatHotkey,
  HOTKEYS,
  isHotkeyPress,
  labelWithHotkey,
  osOf,
} from "./hotkeys.ts";

const press = (
  key: string,
  modifiers: Partial<Record<"alt" | "ctrl" | "meta" | "shift", boolean>> = {},
) => ({
  altKey: modifiers.alt === true,
  ctrlKey: modifiers.ctrl === true,
  key,
  metaKey: modifiers.meta === true,
  shiftKey: modifiers.shift === true,
});

describe("formatHotkey", () => {
  it("names the keys the way each computer does", () => {
    expect(formatHotkey(HOTKEYS.primary, "mac")).toBe("⌘↵");
    expect(formatHotkey(HOTKEYS.primary, "other")).toBe("Ctrl+Enter");
    expect(formatHotkey(HOTKEYS.toInbox, "mac")).toBe("⌥↵");
    expect(formatHotkey(HOTKEYS.toInbox, "other")).toBe("Alt+Enter");
    expect(formatHotkey(HOTKEYS.enter, "mac")).toBe("↵");
    expect(formatHotkey(HOTKEYS.focus, "other")).toBe("F");
    expect(ariaHotkey(HOTKEYS.primary, "mac")).toBe("Meta+Enter");
    expect(ariaHotkey(HOTKEYS.toInbox, "other")).toBe("Alt+Enter");
  });
});

describe("isHotkeyPress", () => {
  it("takes ⌘ on a Mac and Ctrl elsewhere, with exactly the shortcut's modifiers", () => {
    expect(isHotkeyPress(HOTKEYS.primary, press("Enter", { meta: true }), "mac")).toBe(true);
    expect(isHotkeyPress(HOTKEYS.primary, press("Enter", { ctrl: true }), "mac")).toBe(false);
    expect(isHotkeyPress(HOTKEYS.primary, press("Enter", { ctrl: true }), "other")).toBe(true);
    expect(isHotkeyPress(HOTKEYS.primary, press("Enter"), "other")).toBe(false);
    expect(isHotkeyPress(HOTKEYS.focus, press("F"), "other")).toBe(true);
    expect(isHotkeyPress(HOTKEYS.focus, press("f", { ctrl: true }), "other")).toBe(false);
    // A Russian layout: the F key types «а», the shortcut still answers.
    expect(isHotkeyPress(HOTKEYS.focus, { ...press("а"), code: "KeyF" }, "other")).toBe(true);
    expect(isHotkeyPress(HOTKEYS.newTask, { ...press("а"), code: "KeyF" }, "other")).toBe(false);
  });

  it("leaves bare letters to the field being typed in", () => {
    expect(canFireWhileTyping(HOTKEYS.focus)).toBe(false);
    expect(canFireWhileTyping(HOTKEYS.primary)).toBe(true);
    expect(canFireWhileTyping(HOTKEYS.escape)).toBe(true);
  });
});

describe("labelWithHotkey", () => {
  it("adds the shortcut the way this computer names it, and nothing without a keyboard", () => {
    expect(labelWithHotkey("To Inbox", HOTKEYS.toInbox, "mac")).toBe("To Inbox · ⌥↵");
    expect(labelWithHotkey("To Inbox", HOTKEYS.toInbox, "other")).toBe("To Inbox · Alt+Enter");
    expect(labelWithHotkey("New task", HOTKEYS.newTask, "mac")).toBe("New task · N");
    expect(labelWithHotkey("New task", HOTKEYS.newTask, null)).toBe("New task");
  });
});

describe("osOf", () => {
  it("reads the platform string", () => {
    expect(osOf("MacIntel")).toBe("mac");
    expect(osOf("macOS")).toBe("mac");
    expect(osOf("Linux x86_64")).toBe("other");
    expect(osOf("Win32")).toBe("other");
  });
});
