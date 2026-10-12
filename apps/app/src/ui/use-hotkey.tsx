import type { ReactNode } from "react";

import type { Hotkey, KeyboardOs } from "./hotkeys.ts";

/** A phone has no keyboard shortcuts to show (the web build swaps in `use-hotkey.web.tsx`). */
export const KEYBOARD: KeyboardOs | null = null;

/** On a phone a shortcut does nothing. */
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- the same hook as the web build's, which does call hooks
export const useHotkey = (_hotkey: Hotkey | undefined, _onPress: () => void): void => undefined;

/** On a phone a sheet's shortcuts have nothing to shadow. */
export const HotkeyLayer = ({ children }: { readonly children: ReactNode }) => children;
