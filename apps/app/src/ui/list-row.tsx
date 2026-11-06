import type { Href } from "expo-router";
import type { ReactNode } from "react";

import { View } from "react-native";

import type { HapticKind } from "../platform/haptics.ts";
import type { RowDensity } from "./list-row-types.ts";
import type { RadioValue } from "./radio-group.tsx";
import type { TextTone } from "./text-props.ts";

import { cx } from "./cx.ts";
import { Icon } from "./icon.tsx";
import { Link } from "./link.tsx";
import { ROW_BOX } from "./list-row-density.ts";
import { Chosen, ControlRow, SelectedBar, SelectFrame, ToggleFrame } from "./list-row-parts.tsx";
import { Pressable } from "./pressable.tsx";
import { SwitchTrack } from "./switch.tsx";
import { Text } from "./text.tsx";

/** The roles a pressable row takes: a button, a link (a row that opens a page), or a tab of a tablist (`toggle` and `select` rows have their own). */
export type RowRole = "button" | "link" | "tab";

/** A setting the whole row flips (spec §4.2.26 SwitchRow): its switch is drawn trailing. */
export type RowToggle = {
  readonly isOn: boolean;
  readonly onChange: (isOn: boolean) => void;
};

type RowProps = {
  readonly title: string;
  /** A title that is content may clamp at this many lines; a UI string wraps (the default). */
  readonly titleLines?: number | undefined;
  /** How a content title reads: weight, tone, strike-through (a closed or dimmed task). */
  readonly titleLook?: undefined | { readonly className?: string; readonly tone?: TextTone };
  /** One line of meta under the title (`footnote`, secondary label; it wraps). */
  readonly subtitle?: string | undefined;
  /** A richer meta line under the title (the task row's `MetaLine`). */
  readonly meta?: ReactNode;
  /** A control or an `icon.control`, aligned to the first title line. */
  readonly leading?: ReactNode;
  /**
  An interactive control (the task row's check) that sits beside a pressable row, not inside it:
  a control in a button is a nested interactive (axe `nested-interactive`). Its 48 target is the
  column, aligned to the first title line; the row's press area starts after it.
  */
  readonly control?: ReactNode;
  /** A value, a control or a chevron, aligned to the first title line. */
  readonly trailing?: ReactNode;
  readonly density?: RowDensity | undefined;
  /** The name said for a pressable row when it differs from what it shows (its state, "running"). */
  readonly label?: string | undefined;
  /**
  The row is the current or picked one: the selection fill and an accent bar at its leading edge
  (a cue that is not colour alone, F-COL-02). A tab says `selected`; a button row
  (the row whose detail the inspector shows) is `aria-current="page"`; a static row says
  `selected` to assistive tech.
  */
  readonly selected?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly haptic?: HapticKind | undefined;
  readonly testID?: string | undefined;
};

type PressProps =
  | {
      /** A navigation row: a link with a trailing chevron. */
      readonly href: Href;
      readonly onPress?: never;
      readonly role?: never;
      readonly select?: never;
      readonly toggle?: never;
    }
  | {
      readonly href?: never;
      readonly onPress?: (() => void) | undefined;
      readonly role?: RowRole | undefined;
      readonly select?: never;
      readonly toggle?: never;
    }
  | {
      readonly href?: never;
      readonly onPress?: never;
      readonly role?: never;
      /** A radio of the `RadioGroup` around it, with a trailing check once chosen. */
      readonly select: RadioValue;
      readonly toggle?: never;
    }
  | {
      readonly href?: never;
      readonly onPress?: never;
      readonly role?: never;
      readonly select?: never;
      /** The whole row is the switch: a press anywhere on it, its label too, flips it (R23-10). */
      readonly toggle: RowToggle;
    };

export type ListRowProps = PressProps & RowProps;

/** The first title line's box (`body` line height): leading and trailing centre on it. */
const LINE_BOX = "min-h-6 justify-center";

export { SelectedBar } from "./list-row-parts.tsx";

/** The slots inside the row's padding: leading, the title column, trailing. */
const Content = ({
  leading,
  meta,
  subtitle,
  title,
  titleLines,
  titleLook,
  trailing,
}: Pick<
  RowProps,
  "leading" | "meta" | "subtitle" | "title" | "titleLines" | "titleLook" | "trailing"
>) => (
  <View className="flex-1 flex-row items-start gap-row-gap" testID="list-row-content">
    {leading === undefined ? null : (
      <View className={LINE_BOX} testID="list-row-leading">
        {leading}
      </View>
    )}
    <View className="min-h-6 flex-1 justify-center gap-0.5">
      {titleLines === undefined ? (
        <Text role="body">{title}</Text>
      ) : (
        <Text
          lines={titleLines}
          policy="clamp"
          role="body"
          {...(titleLook?.className !== undefined && { className: titleLook.className })}
          {...(titleLook?.tone !== undefined && { tone: titleLook.tone })}
        >
          {title}
        </Text>
      )}
      {subtitle === undefined ? null : (
        <Text role="footnote" tone="secondary">
          {subtitle}
        </Text>
      )}
      {meta}
    </View>
    {trailing === undefined ? null : (
      <View className={cx(LINE_BOX, "items-end")} testID="list-row-trailing">
        {trailing}
      </View>
    )}
  </View>
);

/** A navigation row ends in a chevron after whatever else it trails. */
const withChevron = (trailing: ReactNode, isLink: boolean): ReactNode =>
  isLink ? (
    <View className="flex-row items-center gap-2">
      {trailing}
      <Icon name="chevron-right" size="inline" tone="tertiary" />
    </View>
  ) : (
    trailing
  );

type FrameProps = Pick<
  ListRowProps,
  "disabled" | "haptic" | "href" | "label" | "onPress" | "role" | "selected" | "testID"
> & { readonly children: ReactNode; readonly className: string };

/** What the row is: a link (`href`), a control (`onPress`), or a static view. */
const Frame = ({
  children,
  className,
  disabled,
  haptic,
  href,
  label,
  onPress,
  role = "button",
  selected = false,
  testID,
}: FrameProps) => {
  const current = selected ? "page" : undefined;
  if (href !== undefined) {
    return (
      <Link
        aria-current={current}
        className={className}
        disabled={disabled}
        href={href}
        testID={testID}
      >
        {children}
      </Link>
    );
  }
  if (onPress === undefined) {
    return (
      <View
        className={className}
        testID={testID}
        // TalkBack reads the state; react-native-web reads none, and a div with no role may not
        // say `aria-selected`, so the web hears `aria-current`.
        {...(selected && { accessibilityState: { selected: true }, "aria-current": true })}
      >
        {children}
      </View>
    );
  }
  const shared = { className, disabled, haptic, label, onPress, testID };
  return role === "button" || role === "link" ? (
    <Pressable {...shared} aria-current={current} role={role}>
      {children}
    </Pressable>
  ) : (
    <Pressable {...shared} role={role} selected={selected}>
      {children}
    </Pressable>
  );
};

/**
The one row of every grouped list (spec §4.1.1): a leading slot, the title (`body`) with a meta
line under it, and a trailing slot (a value, a control, a chevron). 52 high on a phone and 44 on a
desktop with the row padding (`row.padX` / `row.padY`) and gap (`row.gap`). Leading and trailing
centre on the first title line, so a wrapped title top-aligns them (F-DAT-06). Pressed, hovered
and focused through the kit's Pressable; `href` makes it a navigation link with a chevron.
*/
export const ListRow = ({
  control,
  density = "regular",
  leading,
  meta,
  select,
  subtitle,
  title,
  titleLines,
  titleLook,
  toggle,
  trailing,
  ...frame
}: ListRowProps) => {
  const isSelected = frame.selected === true;
  const body = (end: ReactNode, box = ROW_BOX[density]) => (
    <View className={cx("flex-1 flex-row items-center", box)} testID="list-row-box">
      <Content
        leading={leading}
        meta={meta}
        subtitle={subtitle}
        title={title}
        titleLines={titleLines}
        titleLook={titleLook}
        trailing={end}
      />
    </View>
  );
  if (toggle !== undefined) {
    return (
      <ToggleFrame
        disabled={frame.disabled}
        haptic={frame.haptic}
        hint={subtitle}
        name={title}
        testID={frame.testID}
        toggle={toggle}
      >
        {body(
          <View className="flex-row items-center gap-2">
            {trailing}
            <SwitchTrack disabled={frame.disabled === true} isOn={toggle.isOn} />
          </View>,
        )}
      </ToggleFrame>
    );
  }
  if (select !== undefined) {
    return (
      <SelectFrame
        className="relative flex-row"
        disabled={frame.disabled}
        draw={(isChosen) => body(<Chosen isChosen={isChosen}>{trailing}</Chosen>)}
        hint={subtitle}
        name={title}
        testID={frame.testID}
        value={select}
      />
    );
  }
  if (control !== undefined) {
    return (
      <ControlRow control={control} isSelected={isSelected}>
        <Frame {...frame} className="flex-1 flex-row">
          {body(trailing, "min-h-row py-row-y pl-row-gap pr-row-x")}
        </Frame>
      </ControlRow>
    );
  }
  return (
    <Frame {...frame} className={cx("relative flex-row", isSelected && "bg-fill-1")}>
      {isSelected ? <SelectedBar /> : null}
      {body(withChevron(trailing, frame.href !== undefined))}
    </Frame>
  );
};
