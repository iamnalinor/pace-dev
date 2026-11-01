import { en } from "#app/test/render.tsx";

import { documentTitle, routeTitleKey } from "./route-title.ts";

const say = (key: Parameters<typeof en>[0]): string => en(key);

describe("the page title per route (QA round 11 L11, round 14 L10)", () => {
  it("names each screen the way its header does", () => {
    expect(routeTitleKey("/")).toBe("nav.now");
    expect(routeTitleKey("/day")).toBe("nav.day");
    expect(routeTitleKey("/inbox")).toBe("nav.inbox");
    expect(routeTitleKey("/week")).toBe("nav.week");
    expect(routeTitleKey("/insights")).toBe("nav.insights");
    expect(routeTitleKey("/settings")).toBe("settings.title");
    expect(routeTitleKey("/notifications")).toBe("notifications.title");
    expect(routeTitleKey("/decisions")).toBe("decisions.title");
    expect(routeTitleKey("/history")).toBe("history.title");
    expect(routeTitleKey("/projects")).toBe("nav.projects");
    expect(routeTitleKey("/project/01ABC")).toBe("nav.projects");
    expect(routeTitleKey("/presets/01ABC")).toBe("presets.title");
    expect(routeTitleKey("/task/01ABC")).toBe("nav.task");
    expect(routeTitleKey("/login")).toBe("login.title");
  });

  it("puts the screen before the app's name, and keeps the app's name alone where there is none", () => {
    expect(documentTitle("/settings", say)).toBe("Settings · Pace");
    expect(documentTitle("/task/01ABC", say)).toBe("Task · Pace");
    expect(documentTitle("/somewhere-else", say)).toBe("Pace");
    // A trailing slash or a query names the same screen.
    expect(documentTitle("/week/", say)).toBe("Week · Pace");
    // The app's name comes from the catalog, as everywhere else (fix round 1).
    expect(documentTitle("/week", (key) => (key === "app.name" ? "Темп" : say(key)))).toBe(
      "Week · Темп",
    );
  });
});
