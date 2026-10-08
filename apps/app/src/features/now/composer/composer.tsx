import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

import type { AiReading, Assistant, ComposerEdits, ComposerModel } from "@pace/client";

import { usePace, useT } from "#app/app-state.tsx";
import { zonedText } from "#app/format/time.ts";
import { useRunAction } from "#app/shared/use-run-action.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Button } from "#app/ui/button.tsx";
import { Chip } from "#app/ui/chip.tsx";
import { useTheme } from "#app/ui/theme-provider.tsx";
import { useAiRead, useAutoAiRead, useReadFirst } from "@pace/client/react";
import { formatDuration, IMPORTANCE_COLORS, ImportanceSchema, isBuiltInPreset } from "@pace/core";

import { AiStatus } from "./ai-status.tsx";

const ChipRow = ({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) => (
  <ScrollView
    accessibilityLabel={label}
    contentContainerClassName="gap-1.5 px-1"
    horizontal
    keyboardShouldPersistTaps="handled"
    showsHorizontalScrollIndicator={false}
  >
    {children}
  </ScrollView>
);

/** Due, estimate, link, problems and a new project, read from the line, in words. */
const useFacts = (model: ComposerModel): readonly string[] => {
  const t = useT();
  const viewer = useViewer();
  return [
    ...(model.due === null
      ? []
      : [zonedText({ at: model.due.at, mode: "due", tz: model.due.tz }, viewer)]),
    ...(model.estimateMinutes === null
      ? []
      : [formatDuration(model.estimateMinutes, viewer.language)]),
    ...(model.link === null ? [] : [`${model.link.host} ↗`]),
    ...(model.subtasks.length === 0
      ? []
      : [t("composer.problems", { list: model.subtasks.map((item) => item.label).join(", ") })]),
    ...(model.newProjectName === null
      ? []
      : [t("composer.newProject", { name: model.newProjectName })]),
  ];
};

/** What the line was read as: one-tap category, importance and project; the rest as facts. */
const ComposerChips = ({
  model,
  onEdit,
}: {
  readonly model: ComposerModel;
  readonly onEdit: (edits: ComposerEdits) => void;
}) => {
  const t = useT();
  const facts = useFacts(model);
  return (
    <View className="gap-2 pt-2">
      <ChipRow label={t("composer.category")}>
        {model.presets.map((preset) => (
          <Chip
            color={preset.color}
            key={preset.id}
            onPress={() => {
              onEdit({ importance: undefined, presetId: preset.id });
            }}
            selected={preset.id === model.preset.id}
          >
            {isBuiltInPreset(preset.id) ? t(`preset.base.${preset.id}`) : preset.name}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow label={t("edit.importance")}>
        {ImportanceSchema.options.map((importance) => (
          <Chip
            color={IMPORTANCE_COLORS[importance]}
            key={importance}
            onPress={() => {
              onEdit({ importance });
            }}
            selected={importance === model.importance}
          >
            {t(`importance.${importance}`)}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow label={t("composer.project")}>
        <Chip
          onPress={() => {
            onEdit({ projectId: null });
          }}
          selected={model.project === null && model.newProjectName === null}
        >
          {t("composer.noProject")}
        </Chip>
        {model.projects.map((project) => (
          <Chip
            color={project.color}
            key={project.id}
            label={t("composer.projectNamed", { name: project.name })}
            onPress={() => {
              onEdit({ projectId: project.id });
            }}
            selected={project.id === model.project?.id}
          >
            {project.name}
          </Chip>
        ))}
      </ChipRow>
      {facts.length === 0 ? null : (
        <Text className="px-1 font-sans text-[12px] text-muted">{facts.join(" · ")}</Text>
      )}
    </View>
  );
};

const ComposerActions = ({
  isReading,
  submitLabel,
  onAdd,
  onAi,
  onInbox,
}: {
  readonly isReading: boolean;
  readonly submitLabel: string;
  readonly onAdd: () => void;
  readonly onAi: () => void;
  readonly onInbox: () => void;
}) => {
  const t = useT();
  return (
    <View className="flex-row gap-2 pt-2">
      <View className="flex-1">
        <Button onPress={onInbox} variant="secondary">
          {t("composer.toInbox")}
        </Button>
      </View>
      <View className="flex-1">
        <Button busy={isReading} onPress={onAi} variant="secondary">
          {t(isReading ? "composer.aiReading" : "composer.ai")}
        </Button>
      </View>
      <View className="flex-1">
        <Button onPress={onAdd}>{submitLabel}</Button>
      </View>
    </View>
  );
};

/** The typed line, the chip taps and the assistant's reading, kept consistent with each other. */
const useDraft = (initialText: string, assistant: Assistant) => {
  const [text, setText] = useState(initialText);
  const [edits, setEdits] = useState<ComposerEdits>({});
  const ai = useAiRead(assistant);
  return {
    ai,
    edits,
    /** The assistant's chips go over the taps so far. */
    onReading: (reading: AiReading): void => {
      setEdits((current) => ({ ...current, ...reading.edits }));
    },
    /** New text makes the assistant's reading stale: its title and problems give way to the rules. */
    onText: (next: string): void => {
      if (ai.state.status === "read") {
        setEdits(({ projectName: _name, subtasks: _subtasks, title: _title, ...rest }) => rest);
      }
      setText(next);
      ai.reset();
    },
    reset: (): void => {
      setText("");
      setEdits({});
      ai.reset();
    },
    setEdits,
    text,
  };
};

/**
The app's entry point on Now: one line read into chips as it is typed; Add stores it (or
adds the problems to this week's homework), To Inbox keeps the raw line for later.
*/
export const Composer = ({ initialText = "" }: { readonly initialText?: string | undefined }) => {
  const t = useT();
  const { actions, assistant, hooks } = usePace();
  const { palette } = useTheme();
  const run = useRunAction();
  const { ai, edits, onReading, onText, reset, setEdits, text } = useDraft(initialText, assistant);
  const model = hooks.useComposer({ edits, text });
  useAutoAiRead(ai, text, onReading);
  const toInbox = async (message = t("add.toInboxDone")): Promise<void> => {
    if (await run(actions.captureInbox(text), { success: message, undo: true })) {
      reset();
    }
  };
  const readFirst = useReadFirst(ai, async () => {
    await toInbox(t("composer.aiSlow"));
  });
  const add = async (): Promise<void> => {
    if (readFirst.isPending(text, onReading)) {
      return;
    }
    const success =
      model.target.kind === "instance"
        ? t("composer.addedTo", { title: model.target.title })
        : t("add.added");
    if (await run(actions.createFromComposer(model), { success, undo: true })) {
      reset();
    }
  };
  return (
    <View className="mx-4 mb-3 rounded-xl border border-line bg-surface p-2">
      <TextInput
        accessibilityHint={t("composer.hint")}
        accessibilityLabel={t("composer.label")}
        // Grows with a pasted message up to about eight lines; Add (below) stores it.
        className="max-h-48 min-h-11 px-2 py-2.5 font-sans text-[15px] leading-6 text-fg"
        multiline
        onChangeText={onText}
        placeholder={t("composer.placeholder")}
        placeholderTextColor={palette.muted}
        textAlignVertical="top"
        value={text}
      />
      {model.isEmpty ? null : (
        <>
          <ComposerChips
            model={model}
            onEdit={(next) => {
              setEdits((current) => ({ ...current, ...next }));
            }}
          />
          <AiStatus
            isWaiting={readFirst.isWaiting}
            onAnswer={(answer) => {
              onText(`${text.trimEnd()} ${answer}`);
            }}
            state={ai.state}
          />
          <ComposerActions
            isReading={ai.state.status === "reading"}
            onAdd={() => {
              void add();
            }}
            onAi={() => {
              void ai.read(text, onReading);
            }}
            onInbox={() => {
              void toInbox();
            }}
            submitLabel={
              model.target.kind === "instance"
                ? t("composer.addTo", { title: model.target.title })
                : t("composer.add")
            }
          />
        </>
      )}
    </View>
  );
};
