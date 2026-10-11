/**
A keyboard shortcut, written once and shown the way the computer names it: `⌘↵` on a Mac,
`Ctrl+Enter` elsewhere. `mod` is ⌘ on a Mac and Ctrl everywhere else.
*/
export type Hotkey = {
  /** `KeyboardEvent.key`: "Enter", "Escape", or a letter ("f", "n"). */
  readonly key: string;
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
};

export type KeyboardOs = "mac" | "other";

/** The parts of a keydown that decide a match. */
export type KeyPress = {
  readonly key: string;
  /** The physical key ("KeyF"): a letter shortcut works on any layout, Russian included. */
  readonly code?: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
};

/** The shortcuts the app shows on its buttons, in one place so none clash. */
export const HOTKEYS = {
  /** A sheet's or a form's action, and the task's Done. */
  primary: { key: "Enter", mod: true },
  /** Enter in the composer: read the line into the form, then add it. */
  enter: { key: "Enter" },
  /** The composer's line straight to the Inbox. */
  toInbox: { key: "Enter", alt: true },
  /** Focus on the open task (not while typing). */
  focus: { key: "f" },
  /** New task: the cursor into the composer (not while typing). */
  newTask: { key: "n" },
  /** Folds an open form back. */
  escape: { key: "Escape" },
} as const satisfies Readonly<Record<string, Hotkey>>;

const MAC_NAMES: Readonly<Record<string, string>> = { Enter: "↵", Escape: "Esc" };

const keyName = (key: string, os: KeyboardOs): string =>
  (os === "mac" ? MAC_NAMES[key] : undefined) ?? (key.length === 1 ? key.toUpperCase() : key);

/** How the shortcut reads on this computer: `⌥⌘↵` on a Mac, `Ctrl+Alt+Enter` elsewhere. */
export const formatHotkey = (hotkey: Hotkey, os: KeyboardOs): string => {
  const key = keyName(hotkey.key, os);
  if (os === "mac") {
    return [
      hotkey.alt === true ? "⌥" : "",
      hotkey.shift === true ? "⇧" : "",
      hotkey.mod === true ? "⌘" : "",
      key,
    ].join("");
  }
  return [
    ...(hotkey.mod === true ? ["Ctrl"] : []),
    ...(hotkey.alt === true ? ["Alt"] : []),
    ...(hotkey.shift === true ? ["Shift"] : []),
    key,
  ].join("+");
};

/** Whether a keydown is this shortcut: the key and exactly its modifiers. */
export const isHotkeyPress = (hotkey: Hotkey, press: KeyPress, os: KeyboardOs): boolean => {
  const isMod = os === "mac" ? press.metaKey : press.ctrlKey;
  const isOther = os === "mac" ? press.ctrlKey : press.metaKey;
  const isLetter = /^[a-z]$/iu.test(hotkey.key);
  const isKey = isLetter
    ? press.code === `Key${hotkey.key.toUpperCase()}` ||
      press.key.toLowerCase() === hotkey.key.toLowerCase()
    : press.key === hotkey.key;
  return (
    isKey &&
    isMod === (hotkey.mod === true) &&
    !isOther &&
    press.shiftKey === (hotkey.shift === true) &&
    press.altKey === (hotkey.alt === true)
  );
};

/** A bare key (a letter) never fires while the person types in a field; a chord or Escape does. */
export const canFireWhileTyping = (hotkey: Hotkey): boolean =>
  hotkey.mod === true || hotkey.alt === true || hotkey.key === "Escape";

/** A Mac, an iPad or an iPhone (a hardware keyboard on one says ⌘); anything else uses Ctrl. */
export const osOf = (platform: string): KeyboardOs =>
  /mac|iphone|ipad|ipod/iu.test(platform) ? "mac" : "other";

/** The shortcut as `aria-keyshortcuts` spells it ("Meta+Enter", "Control+Alt+Enter"). */
export const ariaHotkey = (hotkey: Hotkey, os: KeyboardOs): string =>
  [
    ...(hotkey.mod === true ? [os === "mac" ? "Meta" : "Control"] : []),
    ...(hotkey.alt === true ? ["Alt"] : []),
    ...(hotkey.shift === true ? ["Shift"] : []),
    hotkey.key.length === 1 ? hotkey.key.toUpperCase() : hotkey.key,
  ].join("+");
