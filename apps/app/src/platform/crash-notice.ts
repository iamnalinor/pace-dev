import { useEffect } from "react";

import { useT } from "#app/app-state.tsx";
import { useToast } from "#app/ui/toast.tsx";

import { paceNative } from "../../modules/pace-native/index.ts";

/**
After the app closed on a crash, the next start says where its trace was saved (Downloads/Pace,
written by the native crash catcher), so the file can be found and sent. Once per crash.
*/
export const useCrashNotice = (): void => {
  const toast = useToast();
  const t = useT();
  useEffect(() => {
    const path = paceNative.takeLastCrash();
    if (path !== null) {
      toast.show({ message: t("crash.saved", { path }) });
    }
  }, [t, toast]);
};
