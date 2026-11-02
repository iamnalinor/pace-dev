import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Text, View } from "react-native";

import { type Box, placeTooltip, type Size, TAP_TOOLTIP_MS } from "./tooltip-place.ts";

type Shown = {
  readonly id: number;
  readonly label: string;
  /** Where the trigger is; null until it has been measured. */
  readonly anchor: Box | null;
};

type Host = {
  /** Shows `label` over the trigger, in place of any other tooltip; returns its id. */
  readonly show: (label: string, trigger: RefObject<null | View>) => number;
  /** Hides the tooltip with this id, if it is still the one shown. */
  readonly hide: (id: number) => void;
};

const HostContext = createContext<Host | null>(null);

/** The bubble itself: small, in the inverse colours, a line or two at most. */
const Bubble = ({ label }: { readonly label: string }) => (
  <View className="max-w-tooltip-max rounded-md border border-separator bg-elevated px-2 py-1">
    <Text className="font-sans text-footnote text-label-primary">{label}</Text>
  </View>
);

/** The shown tooltip and the timer that takes it away. */
const useShown = () => {
  const [shown, setShown] = useState<null | Shown>(null);
  const timerRef = useRef<null | ReturnType<typeof setTimeout>>(null);
  const nextIdRef = useRef(0);
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );
  const host = useMemo<Host>(() => {
    const hide = (id: number): void => {
      setShown((current) => (current?.id === id ? null : current));
    };
    return {
      hide,
      show: (label, trigger) => {
        nextIdRef.current += 1;
        const id = nextIdRef.current;
        setShown({ anchor: null, id, label });
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          hide(id);
        }, TAP_TOOLTIP_MS);
        trigger.current?.measureInWindow((...rect) => {
          const [x, y, width, height] = rect;
          setShown((current) =>
            current?.id === id ? { ...current, anchor: { height, width, x, y } } : current,
          );
        });
        return id;
      },
    };
  }, []);
  return {
    host,
    hideAny: () => {
      setShown(null);
    },
    shown,
  };
};

/** The bubble at its place: measured first (unseen), then over or under its trigger. */
const Placed = ({
  anchor,
  area,
  label,
}: {
  readonly anchor: Box | null;
  readonly area: Size;
  readonly label: string;
}) => {
  const [bubble, setBubble] = useState<null | Size>(null);
  const place = anchor === null || bubble === null ? null : placeTooltip(anchor, bubble, area);
  return (
    <View
      onLayout={(event) => {
        setBubble(event.nativeEvent.layout);
      }}
      pointerEvents="none"
      style={{
        left: place?.left ?? 0,
        opacity: place === null ? 0 : 1,
        position: "absolute",
        top: place?.top ?? 0,
      }}
    >
      <Bubble label={label} />
    </View>
  );
};

/**
Where the phone's tooltips show: over everything, at the trigger's place in the window. A
touch anywhere takes the open one away (the tap that opens another included).
*/
export const TooltipHost = ({ children }: { readonly children: ReactNode }) => {
  const { hideAny, host, shown } = useShown();
  const [area, setArea] = useState<Size>({ height: 0, width: 0 });
  return (
    <HostContext value={host}>
      <View
        className="flex-1"
        onLayout={(event) => {
          setArea(event.nativeEvent.layout);
        }}
        onTouchStart={hideAny}
      >
        {children}
        {shown === null ? null : (
          <Placed anchor={shown.anchor} area={area} key={shown.id} label={shown.label} />
        )}
      </View>
    </HostContext>
  );
};

/**
A short explanation of its trigger. On a phone it shows the moment the trigger is tapped (the
trigger's own press still runs) and goes after a couple of seconds or at the next touch. The
web build swaps in `tooltip.web.tsx`, which shows on hover and on keyboard focus. Without a
label there is nothing to explain and the trigger is left as it is.
*/
export const Tooltip = ({
  children,
  label,
  showsOnTap = true,
}: {
  readonly children: ReactNode;
  readonly label: string | undefined;
  /** False for a control whose tap changes the screen anyway (a bubble would be left behind). */
  readonly showsOnTap?: boolean;
}) => {
  const host = use(HostContext);
  const triggerRef = useRef<View>(null);
  const shownIdRef = useRef<null | number>(null);
  // The reason went away (the calendar has an event now): so does what said it.
  useEffect(() => {
    const id = shownIdRef.current;
    if (label === undefined && id !== null) {
      host?.hide(id);
    }
  }, [host, label]);
  return (
    <View
      collapsable={false}
      onTouchEnd={() => {
        if (showsOnTap && label !== undefined && host !== null) {
          shownIdRef.current = host.show(label, triggerRef);
        }
      }}
      ref={triggerRef}
    >
      {children}
    </View>
  );
};
