import { en } from "#app/test/render.tsx";
import { createTestRuntime } from "#app/test/runtime.ts";

import {
  documentTitle,
  routeSubject,
  type RouteSubject,
  routeTitleKey,
  subjectName,
} from "./route-title.ts";

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
    expect(documentTitle("/auth/telegram", say)).toBe("Pace");
    // A path no route answers says so, as the page does (QA 17 L11).
    expect(documentTitle("/somewhere-else", say)).toBe("Page not found · Pace");
    // A trailing slash or a query names the same screen.
    expect(documentTitle("/week/", say)).toBe("Week · Pace");
    // The app's name comes from the catalog, as everywhere else (fix round 1).
    expect(documentTitle("/week", (key) => (key === "app.name" ? "Темп" : say(key)))).toBe(
      "Week · Темп",
    );
  });
});

describe("the page title of a screen about one thing (QA round 18 L8)", () => {
  const names: Readonly<Record<string, string>> = {
    "preset:course": "Курс",
    "project:p1": "Thesis",
    "task:t1": "Algebra HW 6",
    // A person's own words are never translated, even when they spell a screen's name.
    "task:t2": "Settings",
  };
  const nameOf = (subject: RouteSubject): null | string =>
    names[`${subject.kind}:${subject.id}`] ?? null;

  it("names the task, the project or the preset the screen shows", () => {
    expect(documentTitle("/task/t1", say, nameOf)).toBe("Algebra HW 6 · Pace");
    expect(documentTitle("/task/t2", say, nameOf)).toBe("Settings · Pace");
    expect(documentTitle("/project/p1", say, nameOf)).toBe("Thesis · Pace");
    expect(documentTitle("/presets/course", say, nameOf)).toBe("Курс · Pace");
  });

  it("says New preset for the new one, and the screen's name for one it cannot find", () => {
    expect(documentTitle("/presets/new?from=hw", say, nameOf)).toBe("New preset · Pace");
    expect(documentTitle("/task/gone", say, nameOf)).toBe("Task · Pace");
    expect(documentTitle("/project/gone", say, nameOf)).toBe("Projects · Pace");
  });

  it("looks the name up as the person typed it, a default preset in the reader's language", async () => {
    const state = (await createTestRuntime()).state.store.getState();
    const task = Object.values(state.tasks.byId)[0];
    const project = Object.values(state.projects.byId)[0];
    expect(subjectName(state, { id: task?.id ?? "", kind: "task" }, "ru")).toBe(task?.title);
    expect(subjectName(state, { id: project?.id ?? "", kind: "project" }, "ru")).toBe(
      project?.name,
    );
    expect(subjectName(state, { id: "hw", kind: "preset" }, "en")).toBe("Homework");
    expect(subjectName(state, { id: "hw", kind: "preset" }, "ru")).toBe("Домашка");
    expect(subjectName(state, { id: "gone", kind: "task" }, "en")).toBeNull();
    expect(subjectName(state, { id: "toString", kind: "project" }, "en")).toBeNull();
  });

  it("finds the thing a path is about", () => {
    expect(routeSubject("/task/t1")).toEqual({ id: "t1", kind: "task" });
    expect(routeSubject("/project/p1/")).toEqual({ id: "p1", kind: "project" });
    expect(routeSubject("/presets/hw?x=1")).toEqual({ id: "hw", kind: "preset" });
    expect(routeSubject("/presets")).toBeNull();
    expect(routeSubject("/settings/x")).toBeNull();
  });
});
