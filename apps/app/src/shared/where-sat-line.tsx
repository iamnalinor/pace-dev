import { Text } from "react-native";

import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { cx } from "#app/ui/cx.ts";
import { formatDuration, type SatRow } from "@pace/core";

/** Apps per device shown under a block. */
const TOP_APPS = 3;

/**
"Laptop: code 45m, Firefox 15m" under a block, one line per device that was used in it. On Day
it lines up with the block's words, past the time column; elsewhere (`isIndented` off) it starts
at the edge.
*/
export const WhereSatLine = ({
  compact = false,
  isIndented = true,
  rows,
}: {
  readonly rows: readonly SatRow[];
  readonly compact?: boolean;
  readonly isIndented?: boolean;
}) => {
  const t = useT();
  const { language } = useViewer();
  const devices = Object.entries(Object.groupBy(rows, (row) => row.deviceName));
  return devices.map(([device, apps = []]) => (
    <Text
      className={cx(
        "font-sans text-[12px] text-muted",
        !compact && "pb-2",
        isIndented && "pl-[116px]",
      )}
      key={device}
      numberOfLines={compact ? 1 : 2}
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
