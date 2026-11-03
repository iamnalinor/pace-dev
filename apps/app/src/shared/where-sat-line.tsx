import { useT } from "#app/app-state.tsx";
import { useViewer } from "#app/shared/use-viewer.ts";
import { cx } from "#app/ui/cx.ts";
import { Text } from "#app/ui/text.tsx";
import { formatDuration, type SatRow } from "@pace/core";

/** Apps per device shown under a block. */
const TOP_APPS = 3;

/**
"Laptop: code 45m, Firefox 15m" under a block, one line per device that was used in it. It starts
at its parent's edge (on Day the parent lines it up with the block's words).
*/
export const WhereSatLine = ({
  compact = false,
  rows,
}: {
  readonly rows: readonly SatRow[];
  readonly compact?: boolean;
}) => {
  const t = useT();
  const { language } = useViewer();
  const devices = Object.entries(Object.groupBy(rows, (row) => row.deviceName));
  return devices.map(([device, apps = []]) => (
    <Text
      className={cx("font-normal", !compact && "pb-2")}
      key={device}
      lines={compact ? 1 : 2}
      policy="clamp"
      role="caption"
      tone="tertiary"
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
