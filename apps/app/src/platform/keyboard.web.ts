import { useEffect } from "react";

const isField = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement &&
  (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable);

/**
Brings the focused field into what is left of the window when it changes size (the on-screen
keyboard opening). `block: "nearest"` moves nothing when the field is already in view.
*/
export const scrollFocusedFieldIntoView = (): void => {
  const focused = document.activeElement;
  if (isField(focused)) {
    focused.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
};

/**
A phone's browser covers the bottom of the page with its keyboard. The viewport meta asks it to
resize the page instead (`interactive-widget=resizes-content`), and this keeps the focused field
(the time bar's, a sheet's) above the keyboard where the browser does not scroll it there itself
(F-AND-04).
*/
export const KeyboardScroll = () => {
  useEffect(() => {
    /** What the listener needs of the browser's visual viewport. */
    type Viewport = {
      readonly addEventListener: (type: "resize", listener: () => void) => void;
      readonly removeEventListener: (type: "resize", listener: () => void) => void;
    };
    const { visualViewport } = globalThis as { readonly visualViewport?: null | Viewport };
    if (visualViewport === undefined || visualViewport === null) {
      return;
    }
    visualViewport.addEventListener("resize", scrollFocusedFieldIntoView);
    return () => {
      visualViewport.removeEventListener("resize", scrollFocusedFieldIntoView);
    };
  }, []);
  return null;
};
