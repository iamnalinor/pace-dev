import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";

import {
  canFireWhileTyping,
  type Hotkey,
  isHotkeyPress,
  type KeyboardOs,
  osOf,
} from "./hotkeys.ts";
import { useIsScreenActive } from "./screen-active.ts";

type NavigatorWithHints = Navigator & { readonly userAgentData?: { readonly platform?: string } };

const hasKeyboard = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/**
The computer's keyboard, when there is one to speak of (a mouse or a trackpad points finely):
shortcuts are shown on the buttons and work. A touch screen gets neither.
*/
export const KEYBOARD: KeyboardOs | null = hasKeyboard()
  ? osOf(
      (globalThis.navigator as NavigatorWithHints).userAgentData?.platform ??
        globalThis.navigator.platform,
    )
  : null;

type Entry = {
  readonly hotkey: Hotkey;
  readonly layer: number;
  readonly onPress: { current: () => void };
};

/** The open layers, the page's (0) first: only the top one's shortcuts fire. */
const layers: number[] = [0];
const entries = new Set<Entry>();
const registry = { isListening: false, nextLayer: 1 };

/** Where typing happens: a bare key there is a letter, not a shortcut. */
const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"]';

/** Where a bare Enter presses the element itself: a field, a button, a chip, a link. */
const INTERACTIVE =
  'input, textarea, select, button, a, [contenteditable="true"], [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="link"]';

/**
A field that handles its own keys is left alone: entirely (the composer's line, "own"), or
only for Escape (a subtask being typed closes itself on it, "escape").
*/
const OWNS_KEYS = '[data-pace-keys="own"]';
const OWNS_ESCAPE = '[data-pace-keys="escape"]';

const isWithin = (target: EventTarget | null, selector: string): boolean =>
  target instanceof Element && target.closest(selector) !== null;

/** Whether the element in focus keeps this key for itself. */
const isTakenByTarget = (hotkey: Hotkey, target: EventTarget | null): boolean => {
  if (canFireWhileTyping(hotkey)) {
    return false;
  }
  return isWithin(target, hotkey.key === "Enter" ? INTERACTIVE : TEXT_FIELD);
};

const hasOwnKeys = (event: KeyboardEvent): boolean =>
  isWithin(event.target, OWNS_KEYS) ||
  (event.key === "Escape" && isWithin(event.target, OWNS_ESCAPE));

const onKeyDown = (event: KeyboardEvent): void => {
  if (KEYBOARD === null || event.defaultPrevented || event.isComposing || hasOwnKeys(event)) {
    return;
  }
  const top = layers.at(-1) ?? 0;
  // The latest registered wins: the screen opened last is the one in front.
  const match = [...entries].findLast(
    (entry) =>
      entry.layer === top &&
      isHotkeyPress(entry.hotkey, event, KEYBOARD) &&
      !isTakenByTarget(entry.hotkey, event.target),
  );
  if (match === undefined) {
    return;
  }

  // Taken here, before the field: ⌘↵ in a title must not also submit it a second time.
  event.preventDefault();
  event.stopPropagation();
  match.onPress.current();
};

const listen = (): void => {
  if (registry.isListening) {
    return;
  }
  registry.isListening = true;
  // The capture phase: react-native-web's fields stop a keydown from bubbling to the window.
  globalThis.addEventListener("keydown", onKeyDown, { capture: true });
};

const LayerContext = createContext(0);

/** Runs `onPress` on the shortcut while this component is mounted, in its layer. */
export const useHotkey = (hotkey: Hotkey | undefined, onPress: () => void): void => {
  const layer = use(LayerContext);
  const isActive = useIsScreenActive();
  const latestRef = useRef(onPress);
  useEffect(() => {
    latestRef.current = onPress;
  });
  const key = hotkey?.key ?? "";
  const isAlt = hotkey?.alt === true;
  const isMod = hotkey?.mod === true;
  const isShift = hotkey?.shift === true;
  useEffect(() => {
    if (KEYBOARD === null || key === "" || !isActive) {
      return;
    }
    const entry: Entry = {
      hotkey: { alt: isAlt, key, mod: isMod, shift: isShift },
      layer,
      onPress: latestRef,
    };
    entries.add(entry);
    listen();
    return () => {
      entries.delete(entry);
    };
  }, [isActive, isAlt, key, layer, isMod, isShift]);
};

/** A sheet or a dialog: while it is open, the shortcuts behind it are silent. */
export const HotkeyLayer = ({ children }: { readonly children: ReactNode }) => {
  const isActive = useIsScreenActive();
  const [layer] = useState(() => {
    registry.nextLayer += 1;
    return registry.nextLayer;
  });
  useEffect(() => {
    // A form on a screen left behind does not silence the screen in front.
    if (!isActive) {
      return;
    }
    layers.push(layer);
    return () => {
      layers.splice(layers.indexOf(layer), 1);
    };
  }, [isActive, layer]);
  return <LayerContext value={layer}>{children}</LayerContext>;
};
