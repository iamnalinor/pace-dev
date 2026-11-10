import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { View } from "react-native";

import { clipText, clipWords, isRevokedIn, z } from "@pace/core";

import { useAppState, useT } from "../app-state.tsx";
import { cx } from "./cx.ts";
import { CHROME_GAP, PlaceContext, PublishersContext, useFloatLayer } from "./float-layer.ts";
import { IconButton } from "./icon-button.tsx";
import { Presence } from "./presence.tsx";
import { Pressable } from "./pressable.tsx";
import { Text } from "./text.tsx";

export type ToastInput = {
  readonly message: string;
  readonly action?: {
    readonly label: string;
    readonly onPress: () => void;
    /**
    The events an Undo revokes: once any of them is revoked another way (History, a restore, another
    device), the toast goes, so its Undo never offers what was already done (QA round 26 R26-06).
    */
    readonly undoes?: readonly string[];
  };
  /**
  The control the outcome belongs to, when it is still on screen: the toast sits just above it
  (spec §4.1.4) rather than at the foot of the screen.
  */
  readonly anchor?: RefObject<null | View>;
};

type Shown = ToastInput & { readonly id: number };

type ToastHandle = { readonly show: (toast: ToastInput) => void };

const ToastContext = createContext<null | ToastHandle>(null);

/**
Long enough to read a refusal or reach for its offer (about 60 ms a character, at least five
seconds), short enough not to cover a row for long (ten at most).
*/
const visibleMs = (message: string): number =>
  Math.min(10_000, Math.max(5000, message.length * 60));

/**
How much of a value from data (a task title, an event, an action's summary) a toast quotes: about
two lines in the narrowest toast, one on a computer.
*/
export const TOAST_QUOTE_GRAPHEMES = 48;

/**
A value from data, quoted in a toast's sentence: cut short here, so the sentence itself is never
cut. The message is shown whole (UI text wraps, spec 4.1.2 rule 3): a clamp on the whole message
hid the end of the very sentence that explains a refused tap (QA round 22 R22-01).
*/
export const toastQuote = (value: string): string => clipText(value, TOAST_QUOTE_GRAPHEMES);

/** How much of a whole stored sentence (an action's summary) a toast shows: about two quotes. */
export const TOAST_SENTENCE_GRAPHEMES = 2 * TOAST_QUOTE_GRAPHEMES;

/** A whole sentence from data in a toast: cut at a word, never inside one. */
export const toastSentence = (value: string): string => clipWords(value, TOAST_SENTENCE_GRAPHEMES);

/** How the approval toast fits names and stored sentences (`approvalText`). */
export const TOAST_FIT = { quote: toastQuote, sentence: toastSentence } as const;

/**
The toast's card (spec §4.2.30): an elevated surface with its words in full, the one action and a
Close button. The words are not a control (F-A11Y-14): Close dismisses. `ToastLayer` places and
announces it; the gallery shows it.
*/
export const ToastCard = ({
  className,
  onDone,
  toast,
}: {
  readonly className?: string;
  readonly onDone: () => void;
  readonly toast: ToastInput;
}) => {
  const t = useT();
  const undoes = toast.action?.undoes;
  const isUndone = useAppState(
    (state) => undoes?.some((eventId) => isRevokedIn(state.log, eventId)) === true,
  );
  useEffect(() => {
    if (isUndone) {
      onDone();
    }
  }, [isUndone, onDone]);
  return (
    <View
      className={cx(
        "flex-row items-center gap-1 rounded-lg border border-separator bg-elevated py-1 pl-4 pr-1 shadow-lg",
        className,
      )}
      testID="toast-card"
    >
      {/* The words wrap to as many lines as they need. */}
      <Text className="flex-1 py-2" role="callout">
        {toast.message}
      </Text>
      {toast.action === undefined ? null : (
        <Pressable
          className="shrink-0 items-center justify-center rounded-md px-3"
          onPress={() => {
            // Closed first, so the action may show a toast of its own.
            onDone();
            toast.action?.onPress();
          }}
          role="button"
        >
          <Text className="font-semibold" role="callout" tone="accent">
            {toast.action.label}
          </Text>
        </Pressable>
      )}
      <IconButton icon="x" label={t("common.close")} onPress={onDone} />
    </View>
  );
};

/** The toast shown, the one kept through its exit, and its timer (held while pointed at or focused). */
const useShownToast = () => {
  const [toast, setToast] = useState<null | Shown>(null);
  const [kept, setKept] = useState<null | Shown>(null);
  if (toast !== null && toast !== kept) {
    setKept(toast);
  }
  const [isHeld, setIsHeld] = useState(false);
  const hide = useCallback(() => {
    setToast(null);
    setIsHeld(false);
  }, []);
  useEffect(() => {
    if (toast === null || isHeld) {
      return;
    }
    const timer = setTimeout(hide, visibleMs(toast.message));
    return () => {
      clearTimeout(timer);
    };
  }, [hide, isHeld, toast]);
  const handle = useMemo<ToastHandle>(
    () => ({
      show: (input) => {
        setToast((current) => ({ ...input, id: (current?.id ?? 0) + 1 }));
      },
    }),
    [],
  );
  return {
    handle,
    hide,
    hold: setIsHeld,
    kept,
    letGo: () => {
      setKept(null);
    },
    toast,
  };
};

/** Where an anchored toast's foot goes: just above its control, never lower than the chrome. */
const useAnchorBottom = (toast: null | Shown, areaHeight: number): null | number => {
  const [above, setAbove] = useState<null | { readonly id: number; readonly bottom: number }>(null);
  useEffect(() => {
    if (toast?.anchor === undefined) {
      return;
    }
    const { id } = toast;
    toast.anchor.current?.measureInWindow((_x, y) => {
      setAbove({ bottom: areaHeight - y + CHROME_GAP, id });
    });
  }, [areaHeight, toast]);
  return above !== null && above.id === toast?.id ? above.bottom : null;
};

/**
Holds the toast's timer while the pointer or the keyboard is on it. react-native-web hands the
DOM's pointer and focus events on.
*/
const useHoldWhileUsed = (hold: (isHeld: boolean) => void) =>
  useMemo(
    () => ({
      onBlur: () => {
        hold(false);
      },
      onFocus: () => {
        hold(true);
      },
      onPointerEnter: () => {
        hold(true);
      },
      onPointerLeave: () => {
        hold(false);
      },
    }),
    [hold],
  );

/**
One toast at a time over the screen (spec §4.1.4): above the measured bottom chrome (a phone's tab
bar, the screen's footer, the safe area) by `space.3`, above the offline pill when it shows, or
just above its anchor; centred in the content region, never in the sidebar. It is a polite status
region that stays mounted, so a toast's words are announced once, when they arrive, and not again
when the layout moves it. The timer waits while the pointer or the keyboard is on it (WCAG 2.2.1).
*/
export const ToastProvider = ({ children }: { readonly children: ReactNode }) => {
  const shown = useShownToast();
  const [area, setArea] = useState({ height: 0, width: 0 });
  const [toastHeight, setToastHeight] = useState(0);
  const isToastShown = shown.toast !== null;
  const { place, publishers, toastBottom } = useFloatLayer({
    areaWidth: area.width,
    toast: isToastShown ? toastHeight : null,
  });
  const anchorBottom = useAnchorBottom(shown.toast, area.height);
  const holdWhileUsed = useHoldWhileUsed(shown.hold);
  return (
    <ToastContext value={shown.handle}>
      <PublishersContext value={publishers}>
        <PlaceContext value={place}>
          <View
            className="flex-1"
            onLayout={(event) => {
              const { height, width } = event.nativeEvent.layout;
              setArea({ height, width });
            }}
          >
            {children}
            <View
              className="absolute items-center"
              pointerEvents="box-none"
              style={{
                bottom: Math.max(anchorBottom ?? 0, toastBottom),
                left: place.left,
                right: place.right,
                zIndex: z.toast,
              }}
              testID="toast-place"
            >
              <View
                accessibilityLiveRegion="polite"
                aria-live="polite"
                className="w-full max-w-toast-max"
                onLayout={(event) => {
                  setToastHeight(event.nativeEvent.layout.height);
                }}
                pointerEvents="box-none"
                role="status"
                testID="toast"
                {...holdWhileUsed}
              >
                <Presence enter="rise" onExited={shown.letGo} show={isToastShown}>
                  {shown.kept === null ? null : (
                    <ToastCard key={shown.kept.id} onDone={shown.hide} toast={shown.kept} />
                  )}
                </Presence>
              </View>
            </View>
          </View>
        </PlaceContext>
      </PublishersContext>
    </ToastContext>
  );
};

export const useToast = (): ToastHandle => {
  const handle = use(ToastContext);
  if (handle === null) {
    throw new Error("useToast needs a ToastProvider above it");
  }
  return handle;
};
