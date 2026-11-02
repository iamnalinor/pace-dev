import type * as React from "react";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { NowScreen } from "#app/screens/now-screen.tsx";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { useSharedIn } from "./shared-in.ts";

type MockIntent = { readonly text: null | string; readonly webUrl: null | string };

const mockNothing: MockIntent = { text: null, webUrl: null };
/** What Android's share sheet handed over, as `ShareIntentProvider` (above the gate) keeps it. */
const mockShare = { intent: mockNothing, listeners: new Set<() => void>() };

jest.mock("expo-share-intent", () => ({
  useShareIntentContext: () => {
    const shareIntent = jest.requireActual<typeof React>("react").useSyncExternalStore(
      (listener: () => void) => {
        mockShare.listeners.add(listener);
        return () => {
          mockShare.listeners.delete(listener);
        };
      },
      () => mockShare.intent,
    );
    return {
      resetShareIntent: () => {
        mockShare.intent = mockNothing;
        for (const listener of mockShare.listeners) {
          listener();
        }
      },
      shareIntent,
    };
  },
}));

const Line = () => <Text testID="line">{useSharedIn().text}</Text>;

afterEach(() => {
  mockShare.intent = mockNothing;
});

describe("a share from Android's share sheet (QA round 17 round-3 sweep of C1)", () => {
  it("fills the line once: a remount of the Add tab does not bring the share back", async () => {
    mockShare.intent = { text: "Buy milk", webUrl: null };
    const first = await render(<Line />);
    expect(screen.getByTestId("line")).toHaveTextContent("Buy milk");
    await act(async () => {
      await Promise.resolve();
    });
    // The line keeps what was shared while the provider forgets it.
    expect(screen.getByTestId("line")).toHaveTextContent("Buy milk");
    expect(mockShare.intent).toBe(mockNothing);

    // Log out and back in, or the versions screen giving way: the Add tab mounts again.
    await first.unmount();
    await render(<Line />);
    expect(screen.getByTestId("line")).toHaveTextContent("");
  });

  it("a later share fills the line again", async () => {
    await render(<Line />);
    expect(screen.getByTestId("line")).toHaveTextContent("");
    await act(() => {
      mockShare.intent = { text: "Call the bank", webUrl: "https://bank.example" };
      for (const listener of mockShare.listeners) {
        listener();
      }
    });
    expect(screen.getByTestId("line")).toHaveTextContent("Call the bank https://bank.example");
  });
});

/** The Add tab as its route builds it: Now with the share in the composer. */
const Add = () => <NowScreen compose={useSharedIn()} />;
const line = () => screen.getByPlaceholderText(en("composer.placeholder"));

/** Android's share sheet hands over "Buy milk" again: the library makes a new object for each. */
const shareMilk = async () => {
  await act(() => {
    mockShare.intent = { text: "Buy milk", webUrl: null };
    for (const listener of mockShare.listeners) {
      listener();
    }
  });
};

describe("the same text shared twice (QA round 17 round-4 review R2)", () => {
  it("fills the line again: each share is taken once per arrival, not per content", async () => {
    await renderScreen(<Add />, await createTestRuntime());
    await shareMilk();
    expect(line()).toHaveDisplayValue("Buy milk");
    expect(mockShare.intent).toBe(mockNothing);
    // The task is added (the line empties), then the same text is shared again.
    await fireEvent.changeText(line(), "");
    await shareMilk();
    expect(line()).toHaveDisplayValue("Buy milk");
  });
});
