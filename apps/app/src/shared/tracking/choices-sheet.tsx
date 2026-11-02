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

/**
A button's own choices (the chores, the ways to rest), each with its usual length. The one
running already is checked, and picking it only closes the picker: Stop has its own row.
*/
const ButtonChoices = ({ button, close, options, start }: ListProps) => {
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
            if (choice.isRunning) {
              close();
              return;
            }
            start(actions.startChoice(choice.id, options));
          }}
        />
      ))}
    </ChoiceList>
  );
};

/**
The open tasks in Now's order with their deadlines (instances of a series share a title),
narrowed by the search above; a pick starts Focus on it, as the
task's own Focus button does. The task in focus already is checked and only closes the picker.
*/
const TaskChoices = ({
  button,
  close,
  focused,
  options,
  query,
  start,
}: ListProps & { readonly query: string; readonly focused: null | string }) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const board = hooks.useNow();
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
          <MetaLine parts={row.meta} tag={row} />
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
    <View className="h-hit-web flex-row items-center gap-2 rounded-lg border border-outline bg-app px-3">
      <Search color={palette["label.secondary"]} size={16} />
      <TextInput
        accessibilityLabel={t("time.taskSearch")}
        autoFocus={isWide}
        className="h-hit-web flex-1 font-sans text-callout text-label-primary"
        onChangeText={onChange}
        placeholder={t("time.taskSearch")}
        placeholderTextColor={palette["label.tertiary"]}
        returnKeyType="search"
        value={query}
      />
    </View>
  );
};

/**
The running button's way out, first in its picker: Stop is one tap away. Filled, centred and
without an outline, it reads as an action, not as one more thing to start.
*/
const StopRow = ({ onStop }: { readonly onStop: () => void }) => {
  const t = useT();
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityLabel={t("time.stop")}
      accessibilityRole="button"
      className="min-h-12 flex-row items-center justify-center gap-2 rounded-lg bg-fill-4 px-4 active:opacity-70"
      onPress={onStop}
    >
      <Square color={palette["label.primary"]} size={14} />
      <Text className="font-sans text-callout font-medium text-label-primary">
        {t("time.stop")}
      </Text>
    </Pressable>
  );
};

/** What the picker shows of the bar: its button, whether "alongside" applies, the task in focus. */
type Shown = {
  readonly button: TimeButtonView;
  readonly canGoAlongside: boolean;
  readonly focused: null | string;
};

/**
The bar as the picker shows it: live, until a pick is being written. From then on it stays as
it was when tapped, so the pick's own effect (Stop, a check) never flashes in before the picker
closes; a refused pick lets go of it again.
*/
const useShownWhileWriting = (live: Shown, onClose: () => void) => {
  const run = useRunAction();
  const [frozen, setFrozen] = useState<null | Shown>(null);
  const start = (result: ActionResult): void => {
    setFrozen(live);
    void (async () => {
      if (await run(result)) {
        onClose();
        return;
      }
      setFrozen(null);
    })();
  };
  return { shown: frozen ?? live, start };
};

/**
Behind every button of the time bar: what it can start. Its header holds Stop when the button's
own activity runs, the "alongside" switch when something else runs, and Task's search.
*/
export const ChoicesSheet = ({
  calendar,
  onClose,
  ...live
}: {
  readonly button: TimeButtonView;
  readonly calendar: CalendarToday | null;
  readonly canGoAlongside: boolean;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const [isAlongside, setIsAlongside] = useState(false);
  const [query, setQuery] = useState("");
  const { shown, start } = useShownWhileWriting(
    { ...live, focused: hooks.useTimeBar().focusedTaskId },
    onClose,
  );
  const { button, canGoAlongside } = shown;
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
      {button.kind === "task" ? (
        <TaskChoices {...props} focused={shown.focused} query={query} />
      ) : null}
      {button.kind === "choices" ? <ButtonChoices {...props} /> : null}
    </Sheet>
  );
};
