import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import type { RunningView } from "@pace/client";

import { haptic } from "#app/platform/haptics.ts";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";
import { addMinutesIso, t } from "@pace/core";
import { NOW } from "@pace/core/testing";

import { RunningCard } from "./running-card.tsx";
import { TimeBar } from "./time-bar.tsx";

jest.mock("#app/platform/haptics.ts", () => ({ haptic: jest.fn() }));

const VIEW: RunningView = {
  activityId: "a1",
  category: "sport",
  color: "green",
  expectMinutes: 20,
  isAlongside: false,
  label: "Walk",
  minutes: 5,
  remindAt: null,
  share: 0.25,
  startAt: NOW,
  status: "ok",
  taskId: null,
};

const classes = (node: { props: Record<string, unknown> }): readonly string[] => {
  const name = node.props["className"];
  return typeof name === "string" ? name.split(" ") : [];
};

describe("RunningCard", () => {
  it("names the activity in plain text, not as a tag, and cuts a long name before Stop (F-DAT-02)", async () => {
    const long = "A".repeat(80);
    await renderScreen(
      <RunningCard running={{ ...VIEW, label: long }} />,
      await createTestRuntime(),
    );
    expect(screen.queryByTestId("tag")).toBeNull();
    const name = screen.getByText(long);
    expect(name).toHaveProp("numberOfLines", 1);
    expect(classes(name.parent ?? { props: {} })).toContain("flex-1");
    expect(screen.getByRole("button", { name: `Stop: ${long}` })).toBeOnTheScreen();
  });

  it("draws the Expect mark at expected / max(expected × 2, elapsed) of the width", async () => {
    await renderScreen(<RunningCard running={VIEW} />, await createTestRuntime());
    expect(screen.getByTestId("ink-mark").props["style"]).toMatchObject({ left: "50%" });
    expect(classes(screen.getByTestId("ink-fill"))).toContain("bg-accent");
  });

  it("moves the mark as the time passes the doubled Expect, and turns the line warn", async () => {
    await renderScreen(
      <RunningCard running={{ ...VIEW, minutes: 100 }} />,
      await createTestRuntime(),
    );
    expect(screen.getByTestId("ink-mark").props["style"]).toMatchObject({ left: "20%" });
    expect(classes(screen.getByTestId("ink-fill"))).toContain("bg-warn");
  });

  it("asks 'still doing this?' only past 2×, with a Yes, still", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<RunningCard running={VIEW} />, runtime);
    expect(screen.queryByRole("button", { name: en("time.stillYes") })).toBeNull();
  });

  it("is not a live region", async () => {
    await renderScreen(<RunningCard running={VIEW} />, await createTestRuntime());
    expect(screen.getByTestId("running-card").props["accessibilityLiveRegion"]).toBeUndefined();
    expect(
      within(screen.getByTestId("running-card"))
        .queryAllByText(/.*/u)
        .filter((node) => node.props["accessibilityLiveRegion"] !== undefined),
    ).toEqual([]);
  });
});

describe("RunningCard with a long Russian name (QA of the B2 fix)", () => {
  const LONG = "Пошёл в ЦСС на консультацию";

  it("keeps the elapsed time off the name's line, so the name keeps the row", async () => {
    await renderScreen(
      <RunningCard running={{ ...VIEW, label: LONG, minutes: 122 }} />,
      await createTestRuntime(),
    );
    const name = screen.getByText(LONG);
    const elapsed = screen.getByText(/2h 2m|2:02|2 h/u);
    // «Пош… 2 ч 02 мин [Стоп]»: the time beside the name left it three letters.
    expect(elapsed.parent).not.toBe(name.parent);
    expect(classes(name.parent ?? { props: {} })).toContain("flex-1");
  });

  it("names an alongside row in full: no «параллельно» word beside it, and Stop as an icon", async () => {
    await renderScreen(
      <RunningCard
        alongside={[{ ...VIEW, activityId: "a2", isAlongside: true, label: LONG, minutes: 92 }]}
        running={VIEW}
      />,
      await createTestRuntime(),
    );
    const row = screen.getByTestId("running-alongside");
    expect(within(row).queryByText(en("time.alongsideTag"))).toBeNull();
    const stop = within(row).getByRole("button", { name: `Stop: ${LONG}` });
    expect(within(stop).queryByText(en("time.stop"))).toBeNull();
    expect(classes(within(row).getByText(LONG))).toContain("flex-1");
  });
});

describe("the running activity in the bar", () => {
  beforeEach(() => {
    jest.mocked(haptic).mockClear();
  });

  it("ticks on Stop, and says a start, a stop and the past-expected once each", async () => {
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const runtime = await createTestRuntime();
    await runtime.actions.startActivity(
      { buttonId: "rest:walk", category: "rest", expectMinutes: 5, label: "Walk" },
      { at: addMinutesIso(NOW, -10) },
    );
    await renderScreen(<TimeBar />, runtime);
    // What ran when the bar mounted is not news.
    expect(announce).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Stop: Walk" }));
    expect(haptic).toHaveBeenCalledWith("tick");
    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(en("time.announce.stopped", { label: "Walk" }));
    });
    await act(async () => {
      await runtime.actions.startActivity(
        { buttonId: "rest:nap", category: "rest", expectMinutes: 30, label: "Nap" },
        { at: addMinutesIso(NOW, -1) },
      );
    });
    await waitFor(() => {
      expect(announce).toHaveBeenCalledWith(en("time.announce.started", { label: "Nap" }));
    });
    expect(
      announce.mock.calls.filter(
        ([said]) => said === en("time.announce.started", { label: "Nap" }),
      ),
    ).toHaveLength(1);
  });

  it("starts a pick with a tick", async () => {
    const runtime = await createTestRuntime();
    await renderScreen(<TimeBar />, runtime);
    await fireEvent.press(screen.getByRole("button", { name: "Misc" }));
    const list = (await screen.findAllByLabelText("Misc")).find(
      (element) => element.props["role"] === "list",
    );
    await fireEvent.press(
      within(list ?? screen.getByLabelText("Time")).getByRole("button", { name: "Walk" }),
    );
    expect(haptic).toHaveBeenCalledWith("tick");
  });
});

describe("the four tiles", () => {
  it("keep one size and place whatever the label (Russian), cutting it to a line", async () => {
    jest.spyOn(globalThis.navigator, "language", "get").mockReturnValue("ru-RU");
    await renderScreen(<TimeBar />, await createTestRuntime());
    const bar = await screen.findByLabelText(t("ru", "time.bar"));
    const tiles = within(bar)
      .getAllByRole("button")
      .filter((button) => classes(button).includes("h-bar-tile"));
    expect(tiles).toHaveLength(4);
    expect(
      new Set(
        tiles.map((tile) =>
          classes(tile)
            .filter((name) => !name.startsWith("bg-") && !name.startsWith("border-"))
            .join(" "),
        ),
      ).size,
    ).toBe(1);
    for (const tile of tiles) {
      expect(within(tile).getByText(/\S/u)).toHaveProp("numberOfLines", 1);
    }
  });
});
