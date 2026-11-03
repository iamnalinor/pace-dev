import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { usePace, useT } from "#app/app-state.tsx";
import { ProjectForm } from "#app/features/projects/project-form.tsx";
import { DestinationScreen } from "#app/screens/destination-screen.tsx";
import { useConfirmFocus } from "#app/ui/confirm-focus.ts";
import { cx } from "#app/ui/cx.ts";
import { EmptyState } from "#app/ui/empty-state.tsx";
import { inkClass, washClass } from "#app/ui/hue.ts";
import { Icon } from "#app/ui/icon.tsx";
import { openTasksLabel } from "@pace/client";

/**
"+ New project": a name and a color, created on the spot. The form takes the button's place, so
when it closes (cancelled or created) focus goes back to the button, not to the top of the page
(QA round 18 L9).
*/
const NewProject = () => {
  const t = useT();
  const { actions } = usePace();
  const [isOpen, setIsOpen] = useState(false);
  const focus = useConfirmFocus();
  if (!isOpen) {
    return (
      <Pressable
        accessibilityRole="button"
        className="mb-3 h-hit-web flex-row items-center justify-center gap-2 rounded-lg border border-outline active:opacity-70"
        onPress={() => {
          setIsOpen(true);
        }}
        ref={focus.openerRef()}
      >
        <Icon name="plus" size="inline" tone="primary" />
        <Text className="font-sans text-subhead font-normal text-label-primary">
          {t("projects.new")}
        </Text>
      </Pressable>
    );
  }
  const close = (): void => {
    focus.toOpener();
    setIsOpen(false);
  };
  return (
    <View className="mb-3">
      <ProjectForm
        initial={{ color: "blue", name: "" }}
        isNameFocused
        onCancel={close}
        onSave={async (values) => {
          const result = await actions.createProject(values);
          if (result.ok) {
            close();
          }
          return result;
        }}
        submitLabel={t("projects.create")}
      />
    </View>
  );
};

/** Every active project with its open count; a tap opens its page. */
export const ProjectsScreen = () => {
  const t = useT();
  const router = useRouter();
  const { hooks } = usePace();
  const language = hooks.useLanguage();
  const active = hooks.useProjects();
  return (
    <DestinationScreen title={t("nav.projects")}>
      <View className="px-4">
        <NewProject />
        {active.length === 0 ? <EmptyState title={t("projects.empty")} /> : null}
        {active.map((project) => (
          <Pressable
            accessibilityLabel={project.name}
            accessibilityRole="link"
            className={cx(
              "mb-2 min-h-row flex-row items-center gap-3 rounded-xl border px-4 active:opacity-70",
              washClass(project.color),
            )}
            key={project.id}
            onPress={() => {
              router.push(`/project/${project.id}`);
            }}
          >
            <Text
              className={cx("flex-1 font-sans text-callout font-medium", inkClass(project.color))}
            >
              {project.name}
            </Text>
            <Text className="font-sans text-footnote tabular-nums text-label-secondary">
              {openTasksLabel(language, project.open)}
            </Text>
          </Pressable>
        ))}
      </View>
    </DestinationScreen>
  );
};
