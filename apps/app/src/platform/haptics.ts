import { AndroidHaptics, performAndroidHapticsAsync } from "expo-haptics";

/**
What a press means to the hand (spec §3.9–3.10): `confirm` a check-off or a destructive confirm,
`tick` start/stop/switch of an activity, `longPress` a long press that opens a menu, `reject` a
refused action. Nothing else buzzes (no scroll, tab switch or typing).
*/
export type HapticKind = "confirm" | "longPress" | "reject" | "tick";

const ANDROID: Readonly<Record<HapticKind, AndroidHaptics>> = {
  confirm: AndroidHaptics.Confirm,
  longPress: AndroidHaptics.Long_Press,
  reject: AndroidHaptics.Reject,
  tick: AndroidHaptics.Clock_Tick,
};

/**
A phone that cannot vibrate refuses the call; that refusal changes nothing the person sees or
keeps, so it is settled here on purpose.
*/
const play = async (type: AndroidHaptics): Promise<void> => {
  try {
    await performAndroidHapticsAsync(type);
  } catch {
    // No vibrator, or touch feedback off: the press already did what it does.
  }
};

/**
Plays one haptic on Android, never waiting for it: the press's visible result does not depend on
it. The platform honours the system's touch-feedback setting.
*/
export const haptic = (kind: HapticKind): void => {
  void play(ANDROID[kind]);
};
