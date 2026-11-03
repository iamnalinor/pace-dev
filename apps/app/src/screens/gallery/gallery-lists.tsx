import { View } from "react-native";

import type { GalleryData } from "@pace/core/testing";

import { useT } from "#app/app-state.tsx";
import { CountBadge } from "#app/ui/count-badge.tsx";
import { Group } from "#app/ui/group.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { SectionHeader } from "#app/ui/section-header.tsx";
import { Text } from "#app/ui/text.tsx";
import { formatDuration } from "@pace/core";

const NOTHING = (): void => undefined;

/**
The kit's grouped list (spec §4.1.1, §5.0.3): a `SectionHeader` with the count, a `Group` of
`ListRow`s with the set's project names (two lines, then "…"), a picked row, a navigation row, a
compact row with a duration, and a row whose meta wraps. In the worst set the names are the long
Russian and unbreakable ones; the empty set leaves the projects group out entirely.
*/
export const ListSections = ({ data }: { readonly data: GalleryData }) => {
  const t = useT();
  const [first] = data.projects;
  return (
    <View className="pb-2">
      <SectionHeader count={data.projects.length} title={t("dev.gallery.section.lists")} />
      <Group separatorInset="icon">
        {data.projects.map((project) => (
          <ListRow
            key={project.id}
            leading={<Icon name="folder" />}
            onPress={NOTHING}
            selected={project.id === first?.id}
            title={project.name}
            titleLines={2}
            trailing={<CountBadge count={data.inboxCount} tone="neutral" />}
          />
        ))}
      </Group>
      <SectionHeader level={3} title={t("dev.gallery.lists.kinds")} />
      <Group>
        <ListRow href="/settings" title={t("dev.gallery.lists.navigation")} />
        <ListRow subtitle={t("dev.gallery.lists.subtitle")} title={t("dev.gallery.lists.static")} />
        {data.durations.map((minutes, index) => (
          <ListRow
            density="compact"
            // Durations may repeat; their place is what tells the rows apart.
            key={`${String(index)}-${String(minutes)}`}
            title={t("dev.gallery.lists.compact")}
            trailing={
              <Text role="numeric.value" tone="secondary">
                {formatDuration(minutes, data.language)}
              </Text>
            }
          />
        ))}
      </Group>
    </View>
  );
};
