import type * as React from "react";

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { TextInput } from "react-native";

import { forgetLineDraft, useHandedShare, useLineDraftNote, useSharedIn } from "./shared-in.web.ts";

type MockParams = { readonly text?: string };

/** The address as expo-router hands it over: its query and the path, and their listeners. */
const mockAddress = {
  listeners: new Set<() => void>(),
  params: {} as MockParams,
  path: "/add",
};

const mockGo = (path: string, params: MockParams) => {
  mockAddress.path = path;
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
    replace: (path: string) => {
      mockGo(path, {});
    },
  }),
}));

/** The share target: it takes the share from the address. */
const Add = () => {
  useSharedIn();
  return null;
};
/** A line that keeps what it was opened with and tells the share target what it holds, as Now's does. */
const NotedField = ({ initial }: { readonly initial: string }) => {
  const [value, setValue] = useState(initial);
  useLineDraftNote(value);
  return <TextInput onChangeText={setValue} testID="line" value={value} />;
};
/** Now at "/", where the share lands. */
const Now = () => {
  const share = useHandedShare();
  return <NotedField initial={share?.text ?? ""} key={share?.seq ?? 0} />;
};
const App = () => (
  <>
    <Add />
    <Now />
  </>
);

/** The tab's sessionStorage, which the React Native test environment lacks. */
const memoryStorage = (): Pick<Storage, "getItem" | "removeItem" | "setItem"> => {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
};

beforeEach(() => {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: memoryStorage(),
  });
});

afterEach(() => {
  mockAddress.params = {};
  mockAddress.path = "/add";
});

describe("a share to the installed web app (QA round 17 M3, QA round 18 L2)", () => {
  it("lands in Now's line at /, the address replaced", async () => {
    await render(<App />);
    await act(() => {
      mockGo("/add", { text: "Buy milk" });
    });
    expect(screen.getByTestId("line")).toHaveDisplayValue("Buy milk");
    expect(mockAddress).toMatchObject({ params: {}, path: "/" });
  });

  it("fills the line again when the same text is shared again (round-4 review R2)", async () => {
    await render(<App />);
    await act(() => {
      mockGo("/add", { text: "Buy milk" });
    });
    await fireEvent.changeText(screen.getByTestId("line"), "");
    await act(() => {
      mockGo("/add", { text: "Buy milk" });
    });
    expect(screen.getByTestId("line")).toHaveDisplayValue("Buy milk");
  });

  it("does not bring a taken share back on a remount of Now", async () => {
    mockAddress.params = { text: "Buy milk" };
    const first = await render(<App />);
    expect(screen.getByTestId("line")).toHaveDisplayValue("Buy milk");
    await first.unmount();
    await render(<Now />);
    expect(screen.getByTestId("line")).toHaveDisplayValue("");
  });
});

describe("a blank share, or one over a half-typed line (QA round 19 L4)", () => {
  it("lands a blank share at / like the others: no dead /add address, no New task form", async () => {
    const seen: { isNewTask?: boolean }[] = [];
    const Probe = () => {
      seen.push(useSharedIn());
      return null;
    };
    mockAddress.params = { text: " ".repeat(3) };
    await render(
      <>
        <Probe />
        <Now />
      </>,
    );
    expect(mockAddress).toMatchObject({ params: {}, path: "/" });
    expect(seen[0]?.isNewTask).toBe(false);
  });

  it("is New task only on a bare /add", async () => {
    const seen: { isNewTask?: boolean }[] = [];
    const Probe = () => {
      seen.push(useSharedIn());
      return null;
    };
    await render(<Probe />);
    expect(seen.at(-1)?.isNewTask).toBe(true);
    expect(mockAddress.path).toBe("/add");
  });

  it("adds the shared text on a new line after what was typed, instead of replacing it", async () => {
    await render(<App />);
    await fireEvent.changeText(screen.getByTestId("line"), "half typed");
    await act(() => {
      mockGo("/add", { text: "Buy milk" });
    });
    expect(screen.getByTestId("line")).toHaveDisplayValue("half typed\nBuy milk");
  });

  it("keeps what was typed when Now's line goes away before the share target reads it (QA 20 M3)", async () => {
    const now = await render(<Now />);
    await fireEvent.changeText(screen.getByTestId("line"), "half typed");
    // The route changes: "/" goes, /add comes with the share, then "/" again.
    await now.unmount();
    mockAddress.params = { text: "Buy milk" };
    await render(<App />);
    expect(screen.getByTestId("line")).toHaveDisplayValue("half typed\nBuy milk");
  });

  it("keeps what was typed across a new page in the same tab, as the installed app's share opens one (round 6 M3)", async () => {
    // The page before left its half-typed line in the tab's sessionStorage, and nothing in memory.
    globalThis.sessionStorage.setItem("pace.lineDraft", "half typed");
    mockAddress.params = { text: "Buy milk" };
    await render(<App />);
    expect(screen.getByTestId("line")).toHaveDisplayValue("half typed\nBuy milk");
  });

  it("forgets what was typed once signed out: another account's share is only the share (round 7 review 4)", async () => {
    const now = await render(<Now />);
    await fireEvent.changeText(screen.getByTestId("line"), "the old account's note");
    await now.unmount();
    // Signed out (the line has gone with Now), then signed in as someone else, then a share.
    forgetLineDraft();
    mockAddress.params = { text: "Buy milk" };
    await render(<App />);
    expect(screen.getByTestId("line")).toHaveDisplayValue("Buy milk");
  });

  it("a blank share never wipes what was typed (QA 20 M3)", async () => {
    await render(<App />);
    await fireEvent.changeText(screen.getByTestId("line"), "typed X");
    await act(() => {
      mockGo("/add", { text: "  " });
    });
    expect(screen.getByTestId("line")).toHaveDisplayValue("typed X");
    expect(mockAddress).toMatchObject({ params: {}, path: "/" });
  });
});
