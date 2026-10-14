import { Search, Square } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { MetaLine } from "#app/shared/meta-line.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { useIsWide } from "#app/ui/layout.ts";
import { Sheet } from "#app/ui/sheet.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { type ActionResult, taskChoices, type TimeButtonView } from "@pace/client";
import { formatDuration } from "@pace/core";

import type { CalendarToday } from "./calendar-today.ts";

import { CalendarChoices } from "./calendar-choices.tsx";
import { ChoiceItem, ChoiceList, type ListProps, Nothing } from "./choice-row.tsx";

/** A button's own choices (the chores, the ways to rest), each with its usual length. */
const ButtonChoices = ({ button, options, start }: ListProps) => {
  const t = useT();
  const { language } = useViewer();
  const { actions } = usePace();
  return (
    <ChoiceList label={t(button.labelKey)}>
      {button.choices.map((choice) => (
        <ChoiceItem
          aside={`~${formatDuration(choice.expectMinutes, language)}`}
          isRunning={choice.isRunning}
          key={choice.id}
          label={t(choice.labelKey)}
          onPress={() => {
            start(actions.startChoice(choice.id, options));
          }}
        />
      ))}
    </ChoiceList>
  );
};

/**
The open tasks in Now's order, narrowed by the search above; a pick starts Focus on it, as the
task's own Focus button does. The task in focus already is checked and only closes the picker.
*/
const TaskChoices = ({
  button,
  close,
  options,
  query,
  start,
}: ListProps & { readonly query: string }) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const board = hooks.useNow();
  const focused = hooks.useTimeBar().running?.taskId ?? null;
  const rows = taskChoices(board, query);
  if (rows.length === 0) {
    const isEmpty = board.rows.length === 0 && board.future.length === 0;
    return <Nothing>{t(isEmpty ? "time.taskNone" : "time.taskNoMatch")}</Nothing>;
  }
  return (
    <ChoiceList label={t(button.labelKey)}>
      {rows.map((row) => (
        <ChoiceItem
          aside={null}
          isRunning={row.id === focused}
          key={row.id}
          label={row.title}
          onPress={() => {
            if (row.id === focused) {
              close();
              return;
            }
            start(actions.focusTask(row.id, options));
          }}
        >
          <MetaLine parts={[]} tag={row} />
        </ChoiceItem>
      ))}
    </ChoiceList>
  );
};

/** The Task picker's search: narrows the list by title as it is typed. */
const TaskSearch = ({
  onChange,
  query,
}: {
  readonly query: string;
  readonly onChange: (query: string) => void;
}) => {
  const t = useT();
  const { palette } = useTheme();
  // On a phone the keyboard would cover the list it narrows: it opens on a tap in the field.
  const isWide = useIsWide();
  return (
    <View className="h-11 flex-row items-center gap-2 rounded-lg border border-line bg-bg px-3">
      <Search color={palette.muted} size={16} />
      <TextInput
        accessibilityLabel={t("time.taskSearch")}
        autoFocus={isWide}
        className="h-11 flex-1 font-sans text-[15px] text-fg"
        onChangeText={onChange}
        placeholder={t("time.taskSearch")}
        placeholderTextColor={palette.muted}
        returnKeyType="search"
        value={query}
      />
    </View>
  );
};

/** The running button's way out, first in its picker: Stop is one tap away. */
const StopRow = ({ onStop }: { readonly onStop: () => void }) => {
  const t = useT();
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityLabel={t("time.stop")}
      accessibilityRole="button"
      className="min-h-12 flex-row items-center gap-2 rounded-lg border border-line bg-bg px-3.5 active:opacity-70"
      onPress={onStop}
    >
      <Square color={palette.fg} size={14} />
      <Text className="font-sans text-[15px] font-medium text-fg">{t("time.stop")}</Text>
    </Pressable>
  );
};

/**
Behind every button of the time bar: what it can start. Its header holds Stop when the button's
own activity runs, the "alongside" switch when something else runs, and Task's search.
*/
export const ChoicesSheet = ({
  button,
  calendar,
  canGoAlongside,
  onClose,
}: {
  readonly button: TimeButtonView;
  readonly calendar: CalendarToday | null;
  readonly canGoAlongside: boolean;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const { actions } = usePace();
  const run = useRunAction();
  const [isAlongside, setIsAlongside] = useState(false);
  const [query, setQuery] = useState("");
  const start = (result: ActionResult): void => {
    void (async () => {
      if (await run(result)) {
        onClose();
      }
    })();
  };
  const props: ListProps = {
    button,
    calendar,
    close: onClose,
    options: { alongside: isAlongside },
    start,
  };
  const hasHeader = button.isRunning || canGoAlongside || button.kind === "task";
  const header = (
    <>
      {button.isRunning ? (
        <StopRow
          onStop={() => {
            start(actions.stopActivity());
          }}
        />
      ) : null}
      {canGoAlongside ? (
        <SwitchRow isOn={isAlongside} label={t("time.alongside")} onChange={setIsAlongside} />
      ) : null}
      {button.kind === "task" ? <TaskSearch onChange={setQuery} query={query} /> : null}
    </>
  );
  return (
    <Sheet
      closeLabel={t("common.close")}
      {...(hasHeader && { header })}
      onClose={onClose}
      title={t(button.labelKey)}
      visible
    >
      {button.kind === "calendar" ? <CalendarChoices {...props} /> : null}
      {button.kind === "task" ? <TaskChoices {...props} query={query} /> : null}
      {button.kind === "choices" ? <ButtonChoices {...props} /> : null}
    </Sheet>
  );
};
