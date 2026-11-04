import { ActivityIndicator } from "react-native";

import type { HapticKind } from "../platform/haptics.ts";

import { BadgeAnchor, type CountTone } from "./count-badge.tsx";
import { cx } from "./cx.ts";
import { Icon, type IconName, type IconSize } from "./icon.tsx";
import { Pressable } from "./pressable.tsx";
import { useTheme } from "./theme-provider.tsx";
import { Tooltip } from "./tooltip.tsx";

/**
An icon action (spec §4.2.11) on the kit's Pressable: the whole 48 dp / 44 px target is the round
control (`radius.pill`, a borderless ripple on Android, a round overlay and ring on the web), the
glyph in `label.primary` (the icon is its only label). `selected` (a toggle, Week's night hours)
puts a `fill.3` disc under it and says `aria-pressed`; `busy` swaps the glyph for a spinner and
blocks presses; disabled draws the glyph in `label.quaternary`, never an opacity. With no visible
name it names itself in a tooltip on hover and keyboard focus (QA round 17 M7). `badge` hangs a
count off the glyph's top-right corner, growing away from it (F-DAT-10, R23-13b).
*/
export const IconButton = ({
  badge,
  busy = false,
  disabled = false,
  haptic,
  hint,
  icon,
  label,
  onPress,
  selected,
  size = "control",
}: {
  readonly badge?: undefined | { readonly count: number; readonly tone: CountTone };
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly haptic?: HapticKind | undefined;
  readonly hint?: string;
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  /** A toggle's state: the disc and `aria-pressed`; leave it out on a plain action. */
  readonly selected?: boolean | undefined;
  /** `bar` (24) in app bars and headers, `control` (20) in rows. */
  readonly size?: IconSize;
}) => {
  const { palette } = useTheme();
  const isBlocked = disabled || busy;
  const glyph = busy ? (
    <ActivityIndicator color={palette["label.secondary"]} size="small" />
  ) : (
    <Icon name={icon} size={size} tone={disabled ? "quaternary" : "primary"} />
  );
  return (
    <Tooltip label={label}>
      <Pressable
        accessibilityHint={hint}
        aria-busy={busy}
        className={cx("items-center justify-center", selected === true && "bg-fill-3")}
        disabled={isBlocked}
        haptic={haptic}
        label={label}
        onPress={onPress}
        ripple="borderless"
        role="button"
        shape="pill"
        {...(selected !== undefined && { "aria-pressed": selected })}
      >
        {badge === undefined ? (
          glyph
        ) : (
          <BadgeAnchor count={badge.count} tone={badge.tone}>
            {glyph}
          </BadgeAnchor>
        )}
      </Pressable>
    </Tooltip>
  );
};
