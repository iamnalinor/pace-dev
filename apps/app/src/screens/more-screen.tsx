import type { Href } from "expo-router";

import type { MessageKey } from "@pace/core";

import { useT } from "#app/app-state.tsx";
import { Group } from "#app/ui/group.tsx";
import { Icon, type IconName } from "#app/ui/icon.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { ScreenHeader } from "#app/ui/screen-header.tsx";
import { Screen } from "#app/ui/screen.tsx";

type Row = {
  readonly href: Href;
  readonly icon: IconName;
  readonly label: MessageKey;
};

/** What a phone keeps behind More: the sidebar's other destinations, Week first. */
const ROWS: readonly Row[] = [
  { href: "/week", icon: "calendar-range", label: "nav.week" },
  { href: "/projects", icon: "folder", label: "nav.projects" },
  { href: "/insights", icon: "chart-column", label: "nav.insights" },
  { href: "/history", icon: "history", label: "nav.history" },
  { href: "/settings", icon: "settings", label: "nav.settings" },
];

const MoreRow = ({ href, icon, label }: Row) => {
  const t = useT();
  return <ListRow href={href} leading={<Icon name={icon} />} title={t(label)} />;
};

/**
The phone's last tab: the rows that did not fit the tab bar (no profile name: Settings says it).
A wide window has them all in the sidebar and never shows this.
*/
export const MoreScreen = () => {
  const t = useT();
  const [destinations, settings] = [ROWS.slice(0, -1), ROWS.slice(-1)];
  return (
    <Screen header={<ScreenHeader title={t("nav.more")} variant="top" />}>
      <Group className="mt-4">
        {destinations.map((row) => (
          <MoreRow key={row.label} {...row} />
        ))}
      </Group>
      <Group className="mt-4">
        {settings.map((row) => (
          <MoreRow key={row.label} {...row} />
        ))}
      </Group>
    </Screen>
  );
};
