import { Text } from "react-native";

import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { formatDuration, type SatRow } from "@pace/core";

/** Apps per device shown under a block. */
const TOP_APPS = 3;

/** "Laptop: code 45m, Firefox 15m" under a block, one line per device that was used in it. */
export const WhereSatLine = ({ rows }: { readonly rows: readonly SatRow[] }) => {
  const t = useT();
  const { language } = useViewer();
  const devices = Object.entries(Object.groupBy(rows, (row) => row.deviceName));
  return devices.map(([device, apps = []]) => (
    <Text
      className="pb-2 pl-[98px] font-sans text-[12px] text-muted"
      key={device}
      numberOfLines={2}
    >
      {t("day.sat", {
        apps: apps
          .slice(0, TOP_APPS)
          .map((app) => `${app.app} ${formatDuration(app.minutes, language)}`)
          .join(", "),
        device,
      })}
    </Text>
  ));
};
