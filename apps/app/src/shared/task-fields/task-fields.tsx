import { type RefObject, useEffect, useRef, useState } from "react";
import { type TextInput, View } from "react-native";

import type { RepeatChangeProblem } from "@pace/client";

import { useIsAccountUnknown, useIsFirstSync, useLanguage, useT } from "#app/app-state.tsx";
import { focusField } from "#app/platform/focus-field.ts";
import { KnownAfterSync } from "#app/ui/empty-state.tsx";
import { IMPORTANCE_HUES } from "#app/ui/hue.ts";
import { RadioChips } from "#app/ui/radio-chips.tsx";
import { TextField } from "#app/ui/text-field.tsx";
import { TimeCheckScope, useTimeChecks } from "#app/ui/time-check.tsx";
import { ImportanceSchema, presetLabel } from "@pace/core";

import type { TaskFormOptions, TaskFormValues } from "./task-form-types.ts";

import { DatePanel } from "./date-field.tsx";
import { DeadlineAndRepeat, DueBeforeStartNote } from "./deadline-and-repeat.tsx";
import { EstimateOptions } from "./estimate-field.tsx";
import { fieldDraftKey, TaskTextFields } from "./task-text-fields.tsx";
import { WhenChips } from "./when-chips.tsx";

export type { TaskFormValues } from "./task-form-types.ts";

type Panel = "due" | "estimate" | "start" | null;

/** Start, due and estimate as chips; a chip opens its panel (a calendar with a time, or a list). */
const WhenFields = ({
  fallback,
  onChange,
  panel,
  setPanel,
  values,
}: {
  readonly values: TaskFormValues;
  /** The category's estimate, used while the task has none of its own. */
  readonly fallback: null | number;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
  readonly panel: Panel;
  readonly setPanel: (panel: Panel) => void;
}) => {
  const wrapperRef = useRef<View>(null);
  const toggle = (next: Exclude<Panel, null>): void => {
    setPanel(panel === next ? null : next);
  };
  const close = (): void => {
    setPanel(null);
  };
  return (
    <View
      className="gap-2"
      onTouchStart={(event) => {
        event.stopPropagation();
      }}
      ref={wrapperRef}
    >
      <WhenChips fallback={fallback} panel={panel} toggle={toggle} values={values} />
      {panel === "start" || panel === "due" ? (
        <DatePanel
          key={panel}
          kind={panel}
          onChange={(value) => {
            onChange(panel === "start" ? { start: value } : { due: value });
          }}
          onClose={close}
          region={wrapperRef}
          value={panel === "start" ? values.start : values.due}
        />
      ) : null}
      {panel === "estimate" ? (
        <EstimateOptions
          fallback={fallback}
          minutes={values.estimateMinutes}
          onEstimate={(estimateMinutes) => {
            onChange({ estimateMinutes });
            close();
          }}
        />
      ) : null}
    </View>
  );
};

/** The project row's choices besides the projects: none, and a new one the assistant proposed. */
const NO_PROJECT = "project:none";
const NEW_PROJECT = "project:new";

/**
Category, importance and project as one-tap rows, each one tab stop with arrows (`RadioChips`,
round 7 review 10's sweep).
*/
const ChoiceFields = ({
  onChange,
  options,
  values,
}: {
  readonly values: TaskFormValues;
  readonly options: TaskFormOptions;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
}) => {
  const t = useT();
  const language = useLanguage();
  return (
    <>
      <RadioChips
        choices={options.presets.map((preset) => ({
          color: preset.color,
          text: presetLabel(preset, language),
          value: preset.id,
        }))}
        label={t("composer.category")}
        onChange={(presetId) => {
          onChange({ presetId });
        }}
        value={values.presetId}
      />
      <RadioChips
        choices={ImportanceSchema.options.map((importance) => ({
          color: IMPORTANCE_HUES[importance],
          text: t(`importance.${importance}`),
          value: importance,
        }))}
        label={t("edit.importance")}
        onChange={(importance) => {
          onChange({ importance });
        }}
        value={values.importance}
      />
      <RadioChips
        choices={[
          { text: t("composer.noProject"), value: NO_PROJECT },
          ...(values.newProjectName === null
            ? []
            : [
                {
                  text: t("composer.newProject", { name: values.newProjectName }),
                  value: NEW_PROJECT,
                },
              ]),
          ...options.projects.map((project) => ({
            color: project.color,
            label: t("composer.projectNamed", { name: project.name }),
            text: project.name,
            value: project.id,
          })),
        ]}
        label={t("composer.project")}
        onChange={(choice) => {
          // The project the assistant proposed stays chosen until another is picked.
          if (choice !== NEW_PROJECT) {
            onChange({ newProjectName: null, projectId: choice === NO_PROJECT ? null : choice });
          }
        }}
        value={values.projectId ?? (values.newProjectName === null ? NO_PROJECT : NEW_PROJECT)}
      />
    </>
  );
};

/** What the task fields take. */
type TaskFieldsProps = {
  /**
  Where the typed text (title, description, link) is kept on the device until saved (feedback 5
  item 7): `task.<id>` in the editor. The composer's form keeps none: its line does.
  */
  readonly draftKey?: string | undefined;
  readonly values: TaskFormValues;
  readonly options: TaskFormOptions;
  readonly onChange: (patch: Partial<TaskFormValues>) => void;
  /** Enter in the title: the composer's second Enter adds the task. */
  readonly onSubmit?: () => void;
  /** The cursor lands in the title (the composer's line moved there). */
  readonly isTitleFocused?: boolean;
  /**
  How many times a create was tried: from the first, an empty title says it is missing and takes
  the cursor (QA round 24 R24-06), as Projects' name does.
  */
  readonly submitTries?: number;
  readonly showDeadlineIssue?: boolean;
  /** Why the repeat choice could not be saved (the editor checks it before any write). */
  readonly repeatProblem?: null | RepeatChangeProblem;
  /** The start is the person's (the editor shows an automatic one too): only then is a
  deadline before it worth a note. */
  readonly isStartChosen?: boolean;
};

/**
The title's field: where the cursor goes, and whether it asks for a title. A fresh form does not
open blaming the title the person has not typed yet (QA round 14 L6); once typed and cleared, or
once a create was tried without one (R24-06), it asks, and a try puts the cursor there.
*/
const useTitleField = ({
  isTitleFocused,
  ref,
  submitTries,
  title,
}: {
  readonly isTitleFocused: boolean;
  readonly ref: RefObject<null | TextInput>;
  readonly submitTries: number;
  readonly title: string;
}) => {
  const [isTouched, setIsTouched] = useState(false);
  // Not `autoFocus`: on the web that scrolls the box the composer's form is still growing in. A
  // direct load of /add opens the form under a fresh browser's first-sync cover, where a hidden
  // field takes no focus: the cursor comes once the cover lifts (QA21 M2, R23-12).
  const isCovered = useIsFirstSync();
  useEffect(() => {
    if (isTitleFocused && !isCovered) {
      focusField(ref.current);
    }
  }, [isCovered, isTitleFocused, ref]);
  const isMissing = title.trim() === "";
  const triesSeenRef = useRef(0);
  useEffect(() => {
    // Only a new try moves the cursor, not each keystroke.
    if (submitTries === triesSeenRef.current) {
      return;
    }
    triesSeenRef.current = submitTries;
    if (isMissing) {
      focusField(ref.current);
    }
  }, [isMissing, ref, submitTries]);
  return {
    isAsked: isMissing && (submitTries > 0 || isTouched),
    touch: () => {
      setIsTouched(true);
    },
  };
};

/**
The open panels (a date, the estimate, the final deadline) and their close by a touch elsewhere in
the form (Android; the web's pointer is `useOutsidePress`): as their Done does, so a time a panel
cannot read keeps it open and says so, and one read whole («7») is handed over first (R28-01).
*/
const usePanels = () => {
  const [panel, setPanel] = useState<Panel>(null);
  const [isFinalOpen, setIsFinalOpen] = useState(false);
  const panelTimes = useTimeChecks();
  return {
    closeAll: (): void => {
      if (panelTimes.verdict() === "wrong") {
        return;
      }
      setPanel(null);
      setIsFinalOpen(false);
    },
    isFinalOpen,
    panel,
    panelTimes,
    setIsFinalOpen,
    setPanel,
  };
};

/**
The fields of a task, labelled one by one: title, category, importance, project, start, due,
estimate, description and link. The composer's form and the task editor both draw it.
*/
export const TaskFields = ({
  draftKey,
  isTitleFocused = false,
  onChange,
  onSubmit,
  options,
  isStartChosen,
  repeatProblem = null,
  showDeadlineIssue = false,
  submitTries = 0,
  values,
}: TaskFieldsProps) => {
  const t = useT();
  // The categories, their estimates and the projects are the account's: until a sync of this
  // session succeeded, the built-in ones are not drawn as its own (/add during a first sync, class 62).
  const isUnknown = useIsAccountUnknown();
  const titleRef = useRef<TextInput>(null);
  const title = useTitleField({ isTitleFocused, ref: titleRef, submitTries, title: values.title });
  const { closeAll, isFinalOpen, panel, panelTimes, setIsFinalOpen, setPanel } = usePanels();
  return (
    <TimeCheckScope checks={panelTimes}>
      <View className="gap-4" onTouchStart={closeAll}>
        <TextField
          draftKey={fieldDraftKey(draftKey, "title")}
          error={title.isAsked ? t("edit.titleRequired") : null}
          label={t("edit.taskTitle")}
          onChangeText={(next) => {
            title.touch();
            onChange({ title: next });
          }}
          onSubmitEditing={onSubmit}
          ref={titleRef}
          returnKeyType={onSubmit === undefined ? "default" : "done"}
          submitBehavior={onSubmit === undefined ? "blurAndSubmit" : "submit"}
          value={values.title}
        />
        <KnownAfterSync>
          <ChoiceFields onChange={onChange} options={options} values={values} />
        </KnownAfterSync>
        <WhenFields
          fallback={isUnknown ? null : (options.estimates[values.presetId] ?? null)}
          onChange={onChange}
          panel={panel}
          setPanel={setPanel}
          values={values}
        />
        <DueBeforeStartNote isStartChosen={isStartChosen} values={values} />
        <DeadlineAndRepeat
          isFinalOpen={isFinalOpen}
          onChange={onChange}
          onFinalOpenChange={setIsFinalOpen}
          repeatProblem={repeatProblem}
          showDeadlineIssue={showDeadlineIssue}
          values={values}
        />
        <TaskTextFields draftKey={draftKey} onChange={onChange} values={values} />
      </View>
    </TimeCheckScope>
  );
};
