import { act, fireEvent, screen, within } from "@testing-library/react-native";

import { en, renderScreen } from "#app/test/render.tsx";
import { router } from "#app/test/router.ts";
import { createTestRuntime } from "#app/test/runtime.ts";

import { MoreScreen } from "./more-screen.tsx";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("MoreScreen", () => {
  it("lists Week, Projects, Insights, History, Notifications and Settings, each opening its page", async () => {
    await renderScreen(<MoreScreen />, await createTestRuntime({ world: "empty" }));
    expect(screen.getAllByRole("link")).toHaveLength(6);
    for (const key of [
      "nav.week",
      "nav.projects",
      "nav.insights",
      "nav.history",
      "notifications.open",
      "nav.settings",
    ] as const) {
      expect(screen.getByRole("link", { name: en(key) })).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByRole("link", { name: en("notifications.open") }));
    expect(router.navigate).toHaveBeenCalledWith("/notifications");
    await fireEvent.press(screen.getByRole("link", { name: en("nav.history") }));
    expect(router.navigate).toHaveBeenCalledWith("/history");
    await fireEvent.press(screen.getByRole("link", { name: en("nav.settings") }));
    expect(router.navigate).toHaveBeenCalledWith("/settings");
    await fireEvent.press(screen.getByRole("link", { name: en("nav.projects") }));
    expect(router.navigate).toHaveBeenCalledWith("/projects");
    await fireEvent.press(screen.getByRole("link", { name: en("nav.insights") }));
    expect(router.navigate).toHaveBeenCalledWith("/insights");
    await fireEvent.press(screen.getByRole("link", { name: en("nav.week") }));
    expect(router.navigate).toHaveBeenCalledWith("/week");
  });

  it("counts the unread on the Notifications row and says it in the row's name (QA round 22 R22-24)", async () => {
    const runtime = await createTestRuntime({
      routes: {
        "GET /api/notifications": () => ({
          deliveries: {},
          items: [
            {
              createdAt: "2026-10-06T08:00:00.000Z",
              id: "n-login",
              kind: "login",
              payload: { country: "Germany", ip: "", kind: "web", name: "Chrome", sessionId: "s" },
              readAt: null,
              resolution: null,
              resolvedAt: null,
            },
          ],
          more: false,
        }),
      },
      world: "empty",
    });
    await renderScreen(<MoreScreen />, runtime);
    await act(async () => {
      await runtime.notifications.refresh();
    });
    const row = screen.getByRole("link", { name: en("notifications.openUnread", { count: 1 }) });
    expect(within(row).getByTestId("count-badge")).toHaveTextContent("1");
  });

  it("shows no profile name (owner 2026-11-08: Settings says who is signed in)", async () => {
    const runtime = await createTestRuntime({ world: "empty" });
    await runtime.auth.me();
    await renderScreen(<MoreScreen />, runtime);
    expect(screen.queryByText("Ann")).toBeNull();
  });
});
