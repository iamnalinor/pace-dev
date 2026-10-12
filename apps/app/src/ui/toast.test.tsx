import { act, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";

import { ToastProvider, useToast } from "./toast.tsx";

const Shows = ({ message }: { readonly message: string }) => {
  const toast = useToast();
  useEffect(() => {
    toast.show({ message });
  }, [message, toast]);
  return null;
};

const LONG =
  "Calendar starts the meeting that is on now or within 15 minutes. Pace has no access to the calendar yet.";

describe("ToastProvider", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("hides a short toast after five seconds", async () => {
    await render(
      <ToastProvider>
        <Shows message="Deleted" />
      </ToastProvider>,
    );
    expect(screen.getByText("Deleted")).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(5100);
    });
    expect(screen.queryByText("Deleted")).toBeNull();
  });

  it("keeps a long one long enough to read it through", async () => {
    await render(
      <ToastProvider>
        <Shows message={LONG} />
      </ToastProvider>,
    );
    await act(async () => {
      jest.advanceTimersByTime(5100);
    });
    expect(screen.getByText(LONG)).toBeOnTheScreen();
  });
});
