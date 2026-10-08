import { useRouter } from "expo-router";
import { Ellipsis } from "lucide-react-native";
import { Pressable, Text } from "react-native";

import type { TaskViewModel } from "@pace/client";

import { useT } from "#app/app-state.tsx";
import { BackHeader } from "#app/ui/back-header.tsx";
import { ColorTag } from "#app/ui/color.tsx";
import { IconButton } from "#app/ui/icon-button.tsx";

/** Back, the project (a link to its page), and the "more" menu. */
export const TaskHeader = ({
  onMenu,
  project,
}: {
  readonly onMenu?: () => void;
  readonly project: TaskViewModel["project"];
}) => {
  const t = useT();
  const router = useRouter();
  return (
    <BackHeader
      backLabel={t("common.back")}
      onBack={() => {
        router.back();
      }}
      right={
        onMenu === undefined ? null : (
          <IconButton icon={Ellipsis} label={t("task.more")} onPress={onMenu} variant="plain" />
        )
      }
    >
      {project === null ? (
        <Text className="font-sans text-[13px] text-muted">{t("task.noProject")}</Text>
      ) : (
        <Pressable
          accessibilityLabel={project.name}
          accessibilityRole="link"
          className="h-11 flex-row items-center active:opacity-70"
          onPress={() => {
            router.push(`/project/${project.id}`);
          }}
        >
          <ColorTag color={project.color}>{project.name}</ColorTag>
        </Pressable>
      )}
    </BackHeader>
  );
};
