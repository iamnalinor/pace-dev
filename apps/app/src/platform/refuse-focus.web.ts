/**
Gives keyboard focus straight back: a focus trap that walks the modal's descendants
(react-native-web's) then finds this control refused and goes on to the next one. The sheet's dim
is reachable by a click and by a screen reader's browse mode, never by Tab or Shift+Tab (QA round 19
L1: Shift+Tab from a phone sheet's first control wrapped onto the full-screen "Close").
*/
export const refuseFocus = (): void => {
  const active = document.activeElement;
  if (active instanceof HTMLElement) {
    active.blur();
  }
};
