import { createContext, type ReactNode, use, useCallback, useMemo, useRef } from "react";
import { View } from "react-native";

/** What a radio stands for: a string or a number. */
export type RadioValue = number | string;

/** How a choice was made: a press (Enter, Space, a click or a tap) or an arrow moving through. */
export type RadioVia = "arrow" | "press";

/** The keys that move the choice inside the group, and which way. */
const STEP: Readonly<Record<string, -1 | 1>> = {
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -1,
};

type Group = {
  /** The value chosen now; a value outside `values` means none of these is chosen. */
  readonly value: null | RadioValue;
  /** The one radio Tab stops on: the chosen one, else the first. */
  readonly stop: RadioValue | undefined;
  readonly choose: (value: RadioValue, via: RadioVia) => void;
  readonly register: (value: RadioValue, node: unknown) => void;
};

const GroupContext = createContext<Group | null>(null);

/** A radio's part of its group: whether it is the chosen one, its tab stop, its press. */
export type RadioItem = {
  readonly checked: boolean;
  readonly tabIndex: -1 | 0;
  readonly onPress: () => void;
  /** Hands the radio's node to the group, which moves focus onto it on an arrow. */
  readonly setNode: (node: unknown) => void;
};

/**
A radio's place in its `RadioGroup`. A radio outside a group is refused: it would cost a tab stop
of its own and say no group (QA round 21 L1, R23-15: one tab stop per group, swept everywhere).
*/
export const useRadio = (value: RadioValue): RadioItem => {
  const group = use(GroupContext);
  if (group === null) {
    throw new Error("A radio is drawn outside a RadioGroup (one tab stop per group, QA21 L1)");
  }
  const { choose, register } = group;
  const onPress = useCallback(() => {
    choose(value, "press");
  }, [choose, value]);
  const setNode = useCallback(
    (node: unknown) => {
      register(value, node);
    },
    [register, value],
  );
  return {
    checked: group.value === value,
    onPress,
    setNode,
    tabIndex: group.stop === value ? 0 : -1,
  };
};

/**
A labelled radio group with one tab stop, as a radio group is on the web: Tab reaches the chosen
radio (the first when none is), the arrows choose the next or the previous one (wrapping) and take
the focus with them, without scrolling the page as well (round 7 review 9). `onChange` hears how
the choice was made, so a caller can act on a press and leave an arrow's choice alone. Its radios
(a `Chip` with a `value`, or any control built on `useRadio`) are its children, in `values`' order.
*/
export const RadioGroup = <T extends RadioValue>({
  children,
  className,
  label,
  onChange,
  value,
  values,
}: {
  readonly children: ReactNode;
  readonly className?: string | undefined;
  /** The group's accessible name. */
  readonly label: string;
  readonly onChange: (value: T, via: RadioVia) => void;
  readonly value: null | T;
  /** Every radio's value, in the order they are drawn: arrows walk it. */
  readonly values: readonly T[];
}) => {
  const nodesRef = useRef(new Map<RadioValue, unknown>());
  const stop = value !== null && values.includes(value) ? value : values[0];
  const register = useCallback((at: RadioValue, node: unknown) => {
    if (node === null) {
      nodesRef.current.delete(at);
    } else {
      nodesRef.current.set(at, node);
    }
  }, []);
  const choose = useCallback(
    (at: RadioValue, via: RadioVia) => {
      onChange(at as T, via);
    },
    [onChange],
  );
  const group = useMemo<Group>(
    () => ({ choose, register, stop, value }),
    [choose, register, stop, value],
  );
  /** A key event as react-native-web hands it on. */
  type KeyLike = {
    readonly key?: string;
    readonly nativeEvent?: { readonly key?: string };
    readonly preventDefault?: () => void;
  };
  const onKeyDown = (event: KeyLike): void => {
    const step = STEP[event.key ?? event.nativeEvent?.key ?? ""];
    const at = values.findIndex((option) => option === stop);
    const next = step === undefined ? undefined : values.at((at + step) % values.length);
    if (next === undefined) {
      return;
    }
    event.preventDefault?.();
    onChange(next, "arrow");
    (nodesRef.current.get(next) as null | undefined | { focus?: () => void })?.focus?.();
  };
  // react-native-web passes the key events to the DOM; React Native's types do not list them.
  const keys = { onKeyDown };
  return (
    <GroupContext value={group}>
      <View
        accessibilityLabel={label}
        role="radiogroup"
        {...(className !== undefined && { className })}
        {...(keys as object)}
      >
        {children}
      </View>
    </GroupContext>
  );
};
