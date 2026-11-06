import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
Whether the system asks for reduced motion (Android's "Remove animations", the browser's
`prefers-reduced-motion`; react-native-web reads the media query). A kit preset then swaps its
travel and scale for an opacity fade (spec §3.8 `reduced`). Read once, then followed.
*/
export const useIsMotionReduced = (): boolean => {
  const [isReduced, setIsReduced] = useState(false);
  useEffect(() => {
    let isLive = true;
    const read = async (): Promise<void> => {
      const isEnabled = await AccessibilityInfo.isReduceMotionEnabled();
      if (isLive) {
        setIsReduced(isEnabled);
      }
    };
    void read();
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setIsReduced);
    return () => {
      isLive = false;
      subscription.remove();
    };
  }, []);
  return isReduced;
};
