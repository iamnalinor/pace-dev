import { ScrollView } from "react-native";

import type { ProjectChip } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { RadioGroup } from "#app/ui/radio-group.tsx";

/** "All projects" among the project ids (a radio needs a value; no id is empty). */
const ALL = "";

/** "All" and one chip per project with open tasks; nothing when there is nothing to filter. */
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
  if (chips.length === 0) {
    return null;
  }
  return (
    <ScrollView contentContainerClassName="px-4" horizontal showsHorizontalScrollIndicator={false}>
      <RadioGroup
        className="flex-row gap-x-2"
        label={t("now.filterByProject")}
        onChange={(id: string) => {
          onSelect(id === ALL ? null : id);
        }}
        value={selected ?? ALL}
        values={[ALL, ...chips.map((chip) => chip.id)]}
      >
        <Chip value={ALL}>{t("now.allProjects")}</Chip>
        {chips.map((chip) => (
          <Chip hue={chip.color} key={chip.id} value={chip.id}>
            {chip.name}
          </Chip>
        ))}
      </RadioGroup>
    </ScrollView>
  );
};
