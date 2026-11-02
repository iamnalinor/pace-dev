import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { Task } from "@pace/core";

import { useAppState, useT } from "#app/app-state.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";

const MAX_RESULTS = 8;

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
  const { palette } = useTheme();
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
        <Text
          className="min-w-0 flex-1 font-sans text-subhead font-normal text-label-primary"
          numberOfLines={1}
        >
          {label}
        </Text>
        <ChevronDown color={palette["label.secondary"]} size={16} />
      </Pressable>
      {isOpen ? (
        <View accessibilityLabel={t("day.taskLink")} className="gap-1" role="radiogroup">
          <TextField label={t("day.findTask")} onChangeText={setQuery} value={query} />
          <TaskChoice
            isSelected={value === null}
            label={t("day.noTask")}
            onPress={() => {
              choose(null);
            }}
          />
          {matches.map((task) => (
            <TaskChoice
              isSelected={value === task.id}
              key={task.id}
              label={task.title}
              onPress={() => {
                choose(task.id);
              }}
            />
          ))}
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

const TaskChoice = ({
  isSelected,
  label,
  onPress,
}: {
  readonly isSelected: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) => (
  <Pressable
    accessibilityLabel={label}
    accessibilityRole="radio"
    aria-checked={isSelected}
    className="min-h-hit-web justify-center rounded-lg px-3 active:opacity-75"
    onPress={onPress}
  >
    <Text
      className={
        isSelected
          ? "font-sans text-subhead text-accent-text"
          : "font-sans text-subhead font-normal text-label-primary"
      }
      numberOfLines={2}
    >
      {label}
    </Text>
  </Pressable>
);
