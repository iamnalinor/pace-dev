import { Text, View } from "react-native";

import { useT } from "#app/app-state.tsx";
import { clockTime } from "#app/format/time.ts";
import { useViewer } from "#app/shared/use-viewer.ts";
import { Chip } from "#app/ui/chip.tsx";

import type { ReadingIssue } from "./reading-issue.ts";

/**
Why the assistant's answer shows no card, under the field that sent it (time bar, composer), and
"Read it when it's back" where the field can keep its text for that (`onLater`) and no model read
it for now (QA round 21 M3).
*/
export const ReadingIssueLine = ({
  issue,
  onLater,
}: {
  readonly issue: ReadingIssue;
  readonly onLater?: (() => void) | undefined;
}) => {
  const t = useT();
  const { deviceTz } = useViewer();
  return (
    <View className="items-start gap-2">
      <Text accessibilityRole="alert" className="font-sans text-footnote text-danger">
        {issue.retryAt === null
          ? t(issue.key)
          : t(issue.key, { time: clockTime(issue.retryAt, deviceTz) })}
      </Text>
      {onLater !== undefined && issue.canReadLater ? (
        <Chip onPress={onLater}>{t("composer.aiLater")}</Chip>
      ) : null}
    </View>
  );
};
