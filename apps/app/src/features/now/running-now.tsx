import { useRouter } from "expo-router";
import { View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { CompactRunningRow } from "#app/shared/tracking/running-row.tsx";

/**
What runs now, as Now shows it since the time bar moved to Day: one compact row per activity
(the main one, then any alongside), each with its Stop; a tap on the words opens Day. Nothing
at all while nothing runs. It sits under the composer, so the composer never moves when an
activity starts or stops.
*/
export const RunningNow = () => {
  const t = useT();
  const router = useRouter();
  const { hooks } = usePace();
  const { alongside, running } = hooks.useTimeBar();
  const items = [...(running === null ? [] : [running]), ...alongside];
  if (items.length === 0) {
    return null;
  }
  return (
    <View
      aria-label={t("time.running")}
      className="mx-4 mb-3 rounded-xl border border-line bg-surface px-3.5 py-1"
      role="region"
    >
      {items.map((item) => (
        <CompactRunningRow
          key={item.activityId}
          onOpen={() => {
            router.push("/day");
          }}
          running={item}
        />
      ))}
    </View>
  );
};
