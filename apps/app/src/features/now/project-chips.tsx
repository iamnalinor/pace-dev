import { ScrollView } from "react-native";

import type { ProjectChip } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";

/** "All" and one chip per project with open tasks; the selected one filters the list. */
export const ProjectChips = ({
  chips,
  onSelect,
  selected,
}: {
  readonly chips: readonly ProjectChip[];
  readonly onSelect: (projectId: null | string) => void;
  readonly selected: null | string;
}) => {
  const t = useT();
  return (
    <ScrollView
      accessibilityLabel={t("now.filterByProject")}
      contentContainerClassName="gap-1.5 px-4 pb-2"
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      <Chip
        onPress={() => {
          onSelect(null);
        }}
        selected={selected === null}
      >
        {t("now.allProjects")}
      </Chip>
      {chips.map((chip) => (
        <Chip
          color={chip.color}
          key={chip.id}
          onPress={() => {
            onSelect(chip.id);
          }}
          selected={selected === chip.id}
        >
          {chip.name}
        </Chip>
      ))}
    </ScrollView>
  );
};
