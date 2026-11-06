import { View } from "react-native";

import type { NowRow } from "@pace/client";

import { MetaLine } from "#app/shared/meta-line.tsx";
import { ListRow } from "#app/ui/list-row.tsx";

/**
A task as it stood at the chosen moment: read-only, so a state dot leads it where Now has a check
circle that would look live (F-CMP-14). It opens the task as it is now.
*/
export const SnapshotRow = ({
  asOf,
  onOpen,
  row,
}: {
  readonly asOf: string;
  readonly row: NowRow;
  readonly onOpen: () => void;
}) => (
  <ListRow
    leading={<View className="size-2 rounded-pill bg-label-tertiary" />}
    meta={<MetaLine asOf={asOf} parts={row.meta} showRepeat={false} tag={row} />}
    onPress={onOpen}
    role="link"
    title={row.title}
    titleLines={2}
    titleLook={row.dimmed ? { tone: "secondary" } : { className: "font-medium" }}
  />
);
