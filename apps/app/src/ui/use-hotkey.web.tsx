import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";

import {
  canFireWhileTyping,
  type Hotkey,
  isHotkeyPress,
  type KeyboardOs,
  osOf,
} from "./hotkeys.ts";

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

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

const onKeyDown = (event: KeyboardEvent): void => {
  // A field that handled the key itself (the composer's Enter) has the last word.
  if (KEYBOARD === null || event.defaultPrevented || event.isComposing) {
    return;
  }
  const top = layers.at(-1) ?? 0;
  const isTyping = isTextField(event.target);
  // The latest registered wins: the screen opened last is the one in front.
  const match = [...entries].findLast(
    (entry) =>
      entry.layer === top &&
      isHotkeyPress(entry.hotkey, event, KEYBOARD) &&
      (!isTyping || canFireWhileTyping(entry.hotkey)),
  );
  if (match === undefined) {
    return;
  }

  event.preventDefault();
  match.onPress.current();
};

const listen = (): void => {
  if (registry.isListening) {
    return;
  }
  registry.isListening = true;
  globalThis.addEventListener("keydown", onKeyDown);
};

const LayerContext = createContext(0);

/** Runs `onPress` on the shortcut while this component is mounted, in its layer. */
export const useHotkey = (hotkey: Hotkey | undefined, onPress: () => void): void => {
  const layer = use(LayerContext);
  const latestRef = useRef(onPress);
  useEffect(() => {
    latestRef.current = onPress;
  });
  const key = hotkey?.key ?? "";
  const isAlt = hotkey?.alt === true;
  const isMod = hotkey?.mod === true;
  const isShift = hotkey?.shift === true;
  useEffect(() => {
    if (KEYBOARD === null || key === "") {
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
  }, [isAlt, key, layer, isMod, isShift]);
};

/** A sheet or a dialog: while it is open, the shortcuts behind it are silent. */
export const HotkeyLayer = ({ children }: { readonly children: ReactNode }) => {
  const [layer] = useState(() => {
    registry.nextLayer += 1;
    return registry.nextLayer;
  });
  useEffect(() => {
    layers.push(layer);
    return () => {
      layers.splice(layers.indexOf(layer), 1);
    };
  }, [layer]);
  return <LayerContext value={layer}>{children}</LayerContext>;
};
