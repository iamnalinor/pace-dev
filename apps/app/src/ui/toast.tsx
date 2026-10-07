import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Pressable, Text, View } from "react-native";

export type ToastInput = {
  readonly message: string;
  readonly action?: { readonly label: string; readonly onPress: () => void };
};

type Shown = ToastInput & { readonly id: number };

type ToastHandle = { readonly show: (toast: ToastInput) => void };

const ToastContext = createContext<null | ToastHandle>(null);

/** Long enough to reach for "Undo", short enough not to cover the next row for long. */
const VISIBLE_MS = 5000;

const ToastBar = ({ onDone, toast }: { readonly onDone: () => void; readonly toast: Shown }) => (
  <View
    accessibilityLiveRegion="polite"
    accessibilityRole="alert"
    className="absolute inset-x-4 bottom-24 flex-row items-center gap-3 rounded-lg bg-inverse py-1 pl-4 pr-1"
  >
    <Text className="flex-1 py-2.5 font-sans text-[14px] text-inverseFg">{toast.message}</Text>
    {toast.action === undefined ? null : (
      <Pressable
        accessibilityRole="button"
        className="h-11 justify-center rounded-md px-3 active:opacity-70"
        onPress={() => {
          toast.action?.onPress();
          onDone();
        }}
      >
        <Text className="font-sans text-[14px] font-semibold text-inverseFg">
          {toast.action.label}
        </Text>
      </Pressable>
    )}
  </View>
);

/** One toast at a time at the bottom of the screen; a new one replaces the current one. */
export const ToastProvider = ({ children }: { readonly children: ReactNode }) => {
  const [toast, setToast] = useState<null | Shown>(null);
  const hide = useCallback(() => {
    setToast(null);
  }, []);
  useEffect(() => {
    if (toast === null) {
      return;
    }
    const timer = setTimeout(hide, VISIBLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [hide, toast]);
  const handle = useMemo<ToastHandle>(
    () => ({
      show: (input) => {
        setToast((current) => ({ ...input, id: (current?.id ?? 0) + 1 }));
      },
    }),
    [],
  );
  return (
    <ToastContext value={handle}>
      <View className="flex-1">
        {children}
        {toast === null ? null : <ToastBar key={toast.id} onDone={hide} toast={toast} />}
      </View>
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
