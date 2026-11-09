/**
Who hears Escape before any shortcut, sheet or dialog on the web: a shown tooltip, or a field that
handles Escape itself. Escape then takes only the tooltip away (or closes only the field's entry),
and the pane, sheet or dialog under it stays for the next Escape.

Two things close a container on Escape, and both must be held back: the shortcut registry
(`use-hotkey.web.tsx`, a keydown listener on the window in the capture phase, which asks
`didTakeEscape` first) and react-native-web's `Modal` (a keyup listener on the document). So the
taken keydown stops every other listener on the window, and its keyup is swallowed on the window
before it reaches the document.
*/

type Taker = { readonly onEscape: () => void };

/** The tooltips that take Escape, the latest shown last: Escape goes to the top one. */
const takers: Taker[] = [];
const state = { isSwallowingKeyUp: false };
const listening = new WeakSet<EventTarget>();

/** The part of a keyboard event this reads (a duck type: tests run without a browser). */
export type EscapeKey = {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly isComposing: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly preventDefault: () => void;
  readonly stopImmediatePropagation: () => void;
};

const isBareEscape = (event: EscapeKey): boolean =>
  event.key === "Escape" &&
  !event.isComposing &&
  !event.altKey &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.shiftKey;

/**
A bare Escape while a tooltip is shown: taken here (no other listener hears it, its keyup is
swallowed) and the top tooltip goes. Returns whether it was taken.
*/
export const didTakeEscape = (event: EscapeKey): boolean => {
  if (!isBareEscape(event)) {
    return false;
  }
  const top = takers.at(-1);
  if (top === undefined) {
    return false;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  state.isSwallowingKeyUp = true;
  top.onEscape();
  return true;
};

const onKeyUp = (event: EscapeKey): void => {
  if (event.key !== "Escape" || !state.isSwallowingKeyUp) {
    return;
  }
  state.isSwallowingKeyUp = false;
  // On the window in the capture phase: the document (react-native-web's Modal) never hears it.
  event.stopImmediatePropagation();
};

/** A field that handles Escape itself (a subtask being typed closes on it, `use-hotkey.web.tsx`). */
const FIELD_OWNS_ESCAPE = '[data-pace-keys="own"], [data-pace-keys="escape"]';

const onKeyDown = (event: EscapeKey & { readonly target: EventTarget | null }): void => {
  if (!isBareEscape(event) || didTakeEscape(event)) {
    return;
  }
  // An Escape no tooltip takes: its keyup is held back only when a field that handles Escape
  // hears it (its keyup must not close the sheet around it). A keyup left armed by an earlier
  // Escape (the window lost focus before it came) is disarmed here.
  const target = event.target as null | Partial<Pick<Element, "closest">>;
  state.isSwallowingKeyUp =
    typeof target?.closest === "function" && target.closest(FIELD_OWNS_ESCAPE) !== null;
};

const canListen = (target: unknown): target is EventTarget =>
  typeof (target as Partial<EventTarget> | undefined)?.addEventListener === "function";

/** Listens on the window (once), in the capture phase, for the Escape a tooltip takes. */
export const listenForEscape = (target: unknown = globalThis): void => {
  if (!canListen(target) || listening.has(target)) {
    return;
  }
  listening.add(target);
  target.addEventListener("keydown", onKeyDown as unknown as EventListener, { capture: true });
  target.addEventListener("keyup", onKeyUp as unknown as EventListener, { capture: true });
};

/** While a tooltip shows: Escape goes to `onEscape` first. Returns the release. */
export const pushEscapeTaker = (onEscape: () => void): (() => void) => {
  listenForEscape();
  const taker: Taker = { onEscape };
  takers.push(taker);
  return () => {
    const index = takers.indexOf(taker);
    if (index !== -1) {
      takers.splice(index, 1);
    }
  };
};
