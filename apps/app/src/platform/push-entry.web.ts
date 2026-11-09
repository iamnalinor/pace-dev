import { useNavigation } from "expo-router";
import { useCallback } from "react";

import { isStepBackWithout, PUSH_ENTRY } from "#app/ui/tab-history.ts";

/** One step per action: a pick that also clears another param (a week and its block) is one. */
const step = { isTaken: false };

/**
A step in the browser's history for the change about to be written inside this screen (QA round
24 R24-02): the tab navigator grows by one entry (`ui/tab-history.ts`), so expo-router pushes the
address instead of replacing it. More's stack hands the action up to the tabs.
*/
export const usePushEntry = (): (() => void) => {
  const navigation = useNavigation();
  return useCallback(() => {
    if (step.isTaken) {
      return;
    }
    step.isTaken = true;
    queueMicrotask(() => {
      step.isTaken = false;
    });
    navigation.dispatch({ type: PUSH_ENTRY });
  }, [navigation]);
};

/**
After an action removed what the param `name` names: takes back the step that opened it when the
entry before is this screen without it (`isStepBackWithout`), and answers whether it did; the
caller otherwise takes the param off in place (review of round 24, I2).
*/
export const useStepBack = (): ((name: string) => boolean) => {
  const navigation = useNavigation();
  return useCallback(
    (name: string) => {
      if (!isStepBackWithout(navigation.getState() ?? { index: 0, routes: [] }, name)) {
        return false;
      }
      navigation.goBack();
      return true;
    },
    [navigation],
  );
};

/** On the web the tabs keep every visit, as a web page's history does. */
export const TAB_BACK_BEHAVIOR = "fullHistory";
