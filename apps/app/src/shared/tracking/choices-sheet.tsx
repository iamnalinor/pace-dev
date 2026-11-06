import { type RefObject, useState } from "react";
import { ScrollView, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { MetaLine } from "#app/shared/meta-line.tsx";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { useIsWide } from "#app/ui/layout.ts";
import { Popover } from "#app/ui/popover.tsx";
import { Sheet } from "#app/ui/sheet.tsx";
import { SwitchRow } from "#app/ui/switch-row.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { IS_TOUCH_BROWSER } from "#app/ui/use-hotkey.tsx";
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
  // On a phone, or any touch screen in a browser, the keyboard would cover the list it narrows:
  // it opens on a tap in the field (fix round 5 V4: a wide touch browser is no computer).
  const isTypedInAtOnce = useIsWide() && !IS_TOUCH_BROWSER;
  return (
    <TextField
      autoFocus={isTypedInAtOnce}
      isLabelHidden
      label={t("time.taskSearch")}
      onChangeText={onChange}
      placeholder={t("time.taskSearch")}
      purpose="search"
      returnKeyType="search"
      value={query}
    />
  );
};

/**
The running button's way out, first in its picker: Stop is one tap away, a secondary button with
a filled square (never an outline that reads as a checkbox; F-CMP-04).
*/
const StopRow = ({ onStop }: { readonly onStop: () => void }) => {
  const t = useT();
  return (
    <Button
      haptic="tick"
      icon="square"
      isIconFilled
      onPress={onStop}
      variant="secondary"
      width="fill"
    >
      {t("time.stop")}
    </Button>
  );
};

/** A picker's header: Stop when the button's own activity runs, "alongside" when another does, Task's search. */
const PickerHeader = ({
  button,
  canGoAlongside,
  isAlongside,
  onAlongside,
  onQuery,
  onStop,
  query,
}: {
  readonly button: TimeButtonView;
  readonly canGoAlongside: boolean;
  readonly isAlongside: boolean;
  readonly onAlongside: (isOn: boolean) => void;
  readonly onQuery: (query: string) => void;
  readonly onStop: () => void;
  readonly query: string;
}) => {
  const t = useT();
  return (
    <>
      {button.isRunning ? <StopRow onStop={onStop} /> : null}
      {canGoAlongside ? (
        <SwitchRow isOn={isAlongside} label={t("time.alongside")} onChange={onAlongside} />
      ) : null}
      {button.kind === "task" ? <TaskSearch onChange={onQuery} query={query} /> : null}
    </>
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
      const written = await run(result);
      if (written.ok) {
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
  anchor,
  calendar,
  onClose,
  ...live
}: {
  /** The bar button it opens from: on a wide window the picker is a popover anchored to it. */
  readonly anchor: RefObject<null | View>;
  readonly button: TimeButtonView;
  readonly calendar: CalendarToday | null;
  readonly canGoAlongside: boolean;
  readonly onClose: () => void;
}) => {
  const t = useT();
  const { actions, hooks } = usePace();
  const isWide = useIsWide();
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
    <PickerHeader
      button={button}
      canGoAlongside={canGoAlongside}
      isAlongside={isAlongside}
      onAlongside={setIsAlongside}
      onQuery={setQuery}
      onStop={() => {
        start(actions.stopActivity());
      }}
      query={query}
    />
  );
  const body = (
    <>
      {button.kind === "calendar" ? <CalendarChoices {...props} /> : null}
      {button.kind === "task" ? (
        <TaskChoices {...props} focused={shown.focused} query={query} />
      ) : null}
      {button.kind === "choices" ? <ButtonChoices {...props} /> : null}
    </>
  );
  if (isWide) {
    return (
      <Popover anchor={anchor} label={t(button.labelKey)} onClose={onClose} open>
        <ScrollView>
          <View className="gap-3 px-2 pb-2">
            {hasHeader ? <View className="gap-3 px-2">{header}</View> : null}
            {body}
          </View>
        </ScrollView>
      </Popover>
    );
  }
  return (
    <Sheet
      closeLabel={t("common.close")}
      name="time-choices"
      {...(hasHeader && { header })}
      onClose={onClose}
      open
      title={t(button.labelKey)}
    >
      {body}
    </Sheet>
  );
};
