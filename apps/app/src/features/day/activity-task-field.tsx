import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { Task } from "@pace/core";

import { useAppState, useT } from "#app/app-state.tsx";
import { Icon } from "#app/ui/icon.tsx";
import { ListRow } from "#app/ui/list-row.tsx";
import { RadioGroup } from "#app/ui/radio-group.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { Text as KitText } from "#app/ui/text.tsx";

const MAX_RESULTS = 8;

/** "No task" among the task ids (a radio needs a value; no id is empty). */
const NO_TASK = "";

const taskOrder = (a: Task, b: Task): number => {
  if (a.closed === null && b.closed !== null) {
    return -1;
  }
  return a.closed !== null && b.closed === null ? 1 : b.lastEventAt.localeCompare(a.lastEventAt);
};

/** A past or running activity can belong to one existing task, or to none. */
export const ActivityTaskField = ({
  onChange,
  value,
}: {
  readonly value: null | string;
  readonly onChange: (taskId: null | string) => void;
}) => {
  const t = useT();
  const tasks = useAppState((state) => state.tasks.byId);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = value === null ? undefined : tasks[value];
  const label = selected?.title ?? t("day.noTask");
  const matches = Object.values(tasks)
    .filter((task) => task.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .toSorted(taskOrder)
    .slice(0, MAX_RESULTS);
  const choose = (taskId: null | string): void => {
    onChange(taskId);
    setIsOpen(false);
    setQuery("");
  };
  return (
    <View className="gap-2">
      <Text className="font-sans text-caption font-normal text-label-tertiary">
        {t("day.taskLink")}
      </Text>
      <Pressable
        accessibilityLabel={t("day.taskSelection", { title: label })}
        accessibilityRole="button"
        aria-expanded={isOpen}
        className="min-h-hit-web flex-row items-center justify-between gap-2 rounded-lg border border-outline bg-cell px-3 active:opacity-80"
        onPress={() => {
          setIsOpen((current) => !current);
        }}
      >
        <KitText className="flex-1 font-normal" policy="truncate" role="subhead">
          {label}
        </KitText>
        <Icon name="chevron-down" size="inline" />
      </Pressable>
      {isOpen ? (
        <View className="gap-1">
          <TextField label={t("day.findTask")} onChangeText={setQuery} value={query} />
          <RadioGroup
            label={t("day.taskLink")}
            onChange={(taskId: string) => {
              choose(taskId === NO_TASK ? null : taskId);
            }}
            value={value ?? NO_TASK}
            values={[NO_TASK, ...matches.map((task) => task.id)]}
          >
            <ListRow density="compact" select={NO_TASK} title={t("day.noTask")} />
            {matches.map((task) => (
              <ListRow
                density="compact"
                key={task.id}
                select={task.id}
                title={task.title}
                titleLines={2}
              />
            ))}
          </RadioGroup>
          {matches.length === 0 ? (
            <Text className="px-3 py-2 font-sans text-footnote text-label-secondary">
              {t("day.noTaskMatches")}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};
