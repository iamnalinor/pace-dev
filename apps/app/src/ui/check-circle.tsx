import { View } from "react-native";

import { cx } from "./cx.ts";
import { Icon } from "./icon.tsx";
import { Pressable } from "./pressable.tsx";

/** The circle as drawn: rest, pressed (filling), checked at rest, or read-only. */
const Circle = ({
  isChecked,
  isPressed,
  isReadOnly,
}: {
  readonly isChecked: boolean;
  readonly isPressed: boolean;
  readonly isReadOnly: boolean;
}) => {
  const fill = (() => {
    if (isPressed) {
      return "border-accent bg-accent";
    }
    if (isReadOnly) {
      return cx("border-label-quaternary", isChecked && "bg-label-quaternary");
    }
    return isChecked ? "border-label-secondary bg-label-secondary" : "border-outline";
  })();
  return (
    <View
      className={cx("size-6 items-center justify-center rounded-pill border-stroke", fill)}
      testID="check-circle"
    >
      {isPressed || isChecked ? (
        <Icon name="check" size="inline" tone={isPressed ? "onAccent" : "inverse"} />
      ) : null}
    </View>
  );
};

/**
The round check of a task row (spec §4.2.5): a 24 circle in a 1.75 `outline` ring inside the 48 dp /
44 px target (the kit's small-visual pattern, no negative margin; F-AND-01). It fills with the accent
and its check the moment the finger lands (press-in, its own commit; F-MOT-01) and plays the
`confirm` haptic with the check. Checked at rest (Done lists) it is a neutral `label.secondary`
disc, so a Done list is no column of accent fills. Without a press it is a read-only snapshot
(History "as it was"): a `label.quaternary` ring, not a control.
*/
export const CheckCircle = ({
  checked = false,
  label,
  onPress,
}: {
  readonly checked?: boolean;
  readonly label: string;
  readonly onPress?: () => void;
}) => {
  if (onPress === undefined) {
    return (
      <View
        accessibilityLabel={label}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: true }}
        accessible
        aria-checked={checked}
        aria-disabled
        className="min-h-hit min-w-hit items-center justify-center"
      >
        <Circle isChecked={checked} isPressed={false} isReadOnly />
      </View>
    );
  }
  return (
    <Pressable
      checked={checked}
      haptic="confirm"
      label={label}
      onPress={onPress}
      ripple="borderless"
      role="checkbox"
      shape="pill"
      visual=""
    >
      {({ pressed }) => <Circle isChecked={checked} isPressed={pressed} isReadOnly={false} />}
    </Pressable>
  );
};
