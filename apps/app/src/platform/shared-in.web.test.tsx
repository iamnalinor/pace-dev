import type * as React from "react";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { TextInput } from "react-native";

import { useSharedIn } from "./shared-in.web.ts";

type MockParams = { readonly text?: string };

/** The address's query as expo-router hands it over, and its listeners. */
const mockAddress = { listeners: new Set<() => void>(), params: {} as MockParams };

const mockGo = (params: MockParams) => {
  mockAddress.params = params;
  for (const listener of mockAddress.listeners) {
    listener();
  }
};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () =>
    jest.requireActual<typeof React>("react").useSyncExternalStore(
      (listener: () => void) => {
        mockAddress.listeners.add(listener);
        return () => {
          mockAddress.listeners.delete(listener);
        };
      },
      () => mockAddress.params,
    ),
  useRouter: () => ({
    navigate: () => {
      mockGo({});
    },
  }),
}));

/** A line that keeps what it was opened with, as the composer does, keyed by the share's arrival. */
const Field = ({ initial }: { readonly initial: string }) => {
  const [value, setValue] = useState(initial);
  return <TextInput onChangeText={setValue} testID="line" value={value} />;
};
const Add = () => {
  const { seq, text } = useSharedIn();
  return <Field initial={text} key={seq} />;
};

afterEach(() => {
  mockAddress.params = {};
});

describe("the same text shared twice to the installed web app (QA round 17 round-4 review R2)", () => {
  it("fills the line again: each share is taken once per arrival, not per content", async () => {
    await render(<Add />);
    await act(() => {
      mockGo({ text: "Buy milk" });
    });
    expect(screen.getByTestId("line")).toHaveDisplayValue("Buy milk");
    // Taken: the address drops the query.
    expect(mockAddress.params).toEqual({});
    await fireEvent.changeText(screen.getByTestId("line"), "");
    await act(() => {
      mockGo({ text: "Buy milk" });
    });
    expect(screen.getByTestId("line")).toHaveDisplayValue("Buy milk");
  });

  it("does not bring a taken share back on a remount", async () => {
    mockAddress.params = { text: "Buy milk" };
    const first = await render(<Add />);
    expect(screen.getByTestId("line")).toHaveDisplayValue("Buy milk");
    await first.unmount();
    await render(<Add />);
    expect(screen.getByTestId("line")).toHaveDisplayValue("");
  });
});
