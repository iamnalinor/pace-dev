import { act, render, screen } from "@testing-library/react-native";
import { useEffect } from "react";

import { splitGraphemes, t } from "@pace/core";

import { TOAST_QUOTE_GRAPHEMES, ToastProvider, toastQuote, useToast } from "./toast.tsx";

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

describe("the toast's words (QA round 18 R18-01)", () => {
  // The sentences a toast says on its own, longest first: a refused tap and the refusals beside it.
  const SENTENCES = [
    "actionError.persist_failed",
    "settings.push.notSaved",
    "notifications.failedAction",
  ] as const;

  it.each(["en", "ru"] as const)(
    "shows a sentence of its own in full, never cut (%s)",
    async (language) => {
      for (const key of SENTENCES) {
        const message = t(language, key);
        const view = await render(
          <ToastProvider>
            <Shows message={message} />
          </ToastProvider>,
        );
        // UI text wraps and is never truncated (spec 4.1.2 rule 3): no line limit on the message.
        expect(screen.getByText(message).props["numberOfLines"]).toBeUndefined();
        await view.unmount();
      }
    },
  );

  it("quotes a value from data short, so the sentence around it stays whole", () => {
    const title = "Междисциплинарная ".repeat(20).trim();
    const quoted = toastQuote(title);
    expect(splitGraphemes(quoted)).toHaveLength(TOAST_QUOTE_GRAPHEMES);
    expect(quoted.endsWith("…")).toBe(true);
    expect(toastQuote("Buy milk")).toBe("Buy milk");
  });
});
