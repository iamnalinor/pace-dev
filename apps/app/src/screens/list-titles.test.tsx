import { screen } from "@testing-library/react-native";

import { DecisionsScreen } from "#app/features/decisions/decisions-screen.tsx";
import { NotificationsScreen } from "#app/features/notifications/notifications-screen.tsx";
import { PresetsScreen } from "#app/features/presets/presets-screen.tsx";
import { en, renderScreen } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import { SettingsScreen } from "./settings-screen.tsx";

const ROUTES = {
  "GET /api/decisions": () => ({ decisions: [] }),
  "GET /api/notifications": () => ({ deliveries: {}, items: [], more: false }),
  "POST /api/notifications/read": () => ({ ok: true }),
};

/** The screens a phone reaches from More or the bell that list things, Settings first. */
const LISTS = [
  ["Settings", <SettingsScreen key="settings" />, "settings.title"],
  ["Notifications", <NotificationsScreen key="notifications" />, "notifications.title"],
  ["the assistant's log", <DecisionsScreen key="decisions" />, "decisions.title"],
  ["Presets", <PresetsScreen key="presets" />, "presets.title"],
] as const;

const titleClasses = (key: (typeof LISTS)[number][2]): readonly string[] =>
  String(screen.getByRole("header", { name: en(key) }).props["className"]).split(" ");

describe("a list screen's title on a phone (QA PR55-1-18, R27-10, bug-lessons 344)", () => {
  it.each(LISTS)(
    "%s carries Back in the bar and its large title under it, at Settings' height",
    async (_name, ui, key) => {
      await renderScreen(ui, await createTestRuntime({ routes: ROUTES, world: "empty" }));
      expect(titleClasses(key)).toContain("text-largeTitle");
      expect(screen.getByRole("button", { name: en("common.back") })).toBeOnTheScreen();
    },
  );
});
