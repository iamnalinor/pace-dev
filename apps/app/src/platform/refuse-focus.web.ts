/** A focus event as react-native-web passes it: the DOM's fields, or the same under `nativeEvent`. */
type FocusLike = {
  readonly currentTarget?: unknown;
  readonly relatedTarget?: unknown;
  readonly nativeEvent?: { readonly relatedTarget?: unknown };
};

/** The modal (react-native-web's) the dim belongs to. */
const MODAL = '[aria-modal="true"]';

const isElement = (node: unknown): node is Element =>
  typeof (node as null | Partial<Element>)?.closest === "function";

/**
Whether focus came onto the dim from inside its own modal (a screen reader moving on from the
sheet's controls), rather than from the modal's focus trap: the trap gives the first focus from
the control that opened the sheet, and wraps Tab and Shift+Tab from its focus brackets, both
outside the modal itself.
*/
const isFromItsSheet = (dim: unknown, from: unknown): boolean =>
  from !== dim && isElement(dim) && isElement(from) && dim.closest(MODAL)?.contains(from) === true;

/**
Gives keyboard focus straight back when the modal's focus trap (react-native-web's walks the
modal's descendants) put it on this control, as a sheet opens or as Tab wraps: the trap then finds
it refused and goes on to the next one. The sheet's dim is reachable by a click and by a screen
reader, never by Tab or Shift+Tab (QA round 19 L1); a screen reader moving onto it from the sheet
keeps it there, never thrown to the page (round 6 M4).
*/
export const refuseFocus = (event: FocusLike): void => {
  const dim = event.currentTarget;
  const from = event.nativeEvent?.relatedTarget ?? event.relatedTarget ?? null;
  if (!isFromItsSheet(dim, from) && dim instanceof HTMLElement) {
    dim.blur();
  }
};
