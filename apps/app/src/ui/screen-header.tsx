import type { ReactNode } from "react";

import { View } from "react-native";

import { cx } from "./cx.ts";
import { Icon, type IconName } from "./icon.tsx";
import { useIsWide } from "./layout.ts";
import { Pressable } from "./pressable.tsx";
import { Text } from "./text.tsx";
import { Tooltip } from "./tooltip.tsx";

/**
`top`: a destination (Now, Day, Inbox, More and the sidebar's screens) with its large title;
`pushed`: a screen pushed over them (a task, a project, Presets) with Back and a `title1`.
*/
export type HeaderVariant = "pushed" | "top";

type BackProps = {
  /** Without it there is no Back (a top-level screen beside the sidebar or the rail). */
  readonly onBack?: (() => void) | undefined;
  readonly backLabel?: string | undefined;
  /** A cross for a pane that closes rather than a screen to go back from. */
  readonly backIcon?: Extract<IconName, "chevron-left" | "x"> | undefined;
};

export type ScreenHeaderProps = BackProps & {
  readonly variant: HeaderVariant;
  /** The screen's name, its level-1 heading; a pushed screen whose body names it leaves it out. */
  readonly title?: string | undefined;
  /** One line under a top-level title: the date on Now and Day. */
  readonly subtitle?: string | undefined;
  /** The period control (`PeriodStepper`) in the subtitle row: Week, History, Insights. */
  readonly period?: ReactNode;
  /** Up to two icon buttons (and an overflow menu) at the trailing end. */
  readonly actions?: ReactNode;
  /** A pushed screen's context control beside Back (the task's project). */
  readonly context?: ReactNode;
};

/** Back (or Close), its glyph at `icon.bar`, at the full target; the glyph lines up with the gutter. */
const Back = ({ backIcon = "chevron-left", backLabel, onBack }: BackProps) =>
  onBack === undefined ? null : (
    <Tooltip label={backLabel} showsOnTap={false}>
      <Pressable
        className="-ml-3 items-center justify-center rounded-pill"
        label={backLabel}
        onPress={onBack}
        ripple="borderless"
        role="button"
      >
        <Icon name={backIcon} size="bar" tone="primary" />
      </Pressable>
    </Tooltip>
  );

/** The 48 bar: Back, the context, the actions. */
const Bar = ({
  actions,
  context,
  ...back
}: BackProps & Pick<ScreenHeaderProps, "actions" | "context">) => (
  <View className="min-h-hit flex-row items-center gap-2" testID="screen-header-bar">
    <Back {...back} />
    <View className="min-w-0 flex-1 flex-row items-center">{context}</View>
    {actions === undefined ? null : <View className="flex-row items-center gap-2">{actions}</View>}
  </View>
);

const Subtitle = ({ period, subtitle }: Pick<ScreenHeaderProps, "period" | "subtitle">) =>
  subtitle === undefined && period === undefined ? null : (
    <View className="min-h-6 flex-row items-center gap-2" testID="screen-header-subtitle">
      {subtitle === undefined ? null : (
        <Text role="callout" tone="secondary">
          {subtitle}
        </Text>
      )}
      {period}
    </View>
  );

/** The title, and on a desktop's top-level header the actions on its line. */
const TitleRow = ({
  actions,
  isUnderBar,
  title,
  variant,
}: {
  readonly actions: ReactNode;
  /** A phone's top-level title: `header.top` (8) under the bar. */
  readonly isUnderBar: boolean;
  readonly title: string;
  readonly variant: HeaderVariant;
}) => (
  <View
    className={cx("flex-row items-start gap-3", isUnderBar && "mt-header-top")}
    testID="screen-header-title-row"
  >
    <Text className="flex-1" level={1} role={variant === "top" ? "largeTitle" : "title1"}>
      {title}
    </Text>
    {actions === undefined ? null : <View className="flex-row items-center gap-2">{actions}</View>}
  </View>
);

/**
The one header of every screen (spec §4.2.16, §5.0.2), two kinds only. `top` on a phone: a 48 bar
(Back when pushed from More, the actions), the `largeTitle` 8 below it, a subtitle row (the date,
or the period control), 12 to the content; on a desktop 28 above the title, the actions on its
line, 16 to the content, so the title sits at the same y on every destination (F-LAY-02). No
eyebrow (F-TYP-02). `pushed`: the 48 bar (Back, a context control, labelled actions), then the
`title1`, which wraps: an entity name is never cut. Each title is the screen's level-1 heading.
*/
export const ScreenHeader = ({
  actions,
  context,
  period,
  subtitle,
  title,
  variant,
  ...back
}: ScreenHeaderProps) => {
  const isWide = useIsWide();
  const isTopOnDesktop = variant === "top" && isWide;
  return (
    <View
      className={cx(
        "px-gutter pb-header-bottom md:px-gutter-pane lg:px-gutter-lg lg:pb-header-bottom-lg",
        isTopOnDesktop && "pt-header-top-lg",
      )}
      testID="screen-header"
    >
      {isTopOnDesktop ? null : <Bar actions={actions} context={context} {...back} />}
      {title === undefined ? null : (
        <TitleRow
          actions={isTopOnDesktop ? actions : undefined}
          isUnderBar={variant === "top" && !isWide}
          title={title}
          variant={variant}
        />
      )}
      {variant === "top" ? <Subtitle period={period} subtitle={subtitle} /> : null}
    </View>
  );
};
