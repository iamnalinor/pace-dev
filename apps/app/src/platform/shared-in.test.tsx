import type * as React from "react";

import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

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

const Line = () => <Text testID="line">{useSharedIn()}</Text>;

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
