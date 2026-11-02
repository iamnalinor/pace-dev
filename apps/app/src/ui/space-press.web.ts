import type { SpacePress } from "./space-press.ts";

/**
react-native-web presses a pressable on Enter, and on Space only when its role is `button` (or it is
a `<button>`): a switch, a radio and a checkbox ignored Space, which is the key the browser's own
ones answer to. This adds it: it presses once per key (not per repeat) and keeps the page from
scrolling. A Space typed in something inside the control is left alone.
*/
export const spacePress = (onPress: (() => void) | undefined): SpacePress => ({
  onKeyDown: (event) => {
    if (onPress === undefined || event.key !== " " || event.target !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    if (event.repeat !== true) {
      onPress();
    }
  },
});
