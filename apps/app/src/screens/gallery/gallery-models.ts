import type {
  DayRow,
  InboxCard,
  MetaPart,
  NowRow,
  ProjectChip,
  RunningView,
  SessionRow,
  TaskViewModel,
  WeekBlock,
  WeekModel,
} from "@pace/client";
import type { GalleryBlock, GalleryData, GalleryRunning, GalleryTask } from "@pace/core/testing";

import { type PoolNotification, type ProjectColorName, projectHue } from "@pace/core";

/*
The dev gallery's view-models: the shapes the components take, built from plain worst-case data
(`@pace/core/testing`). Pure and clock-free: every instant counts from one Monday in UTC, so a
screenshot of the gallery is the same on every run. Nothing here reads or writes the store.
*/

/** The Monday the gallery's week starts on, and the moment it calls "now" (Wednesday 10:00). */
export const WEEK_START = "2026-03-02T00:00:00.000Z";
export const GALLERY_NOW = "2026-03-04T10:00:00.000Z";
export const GALLERY_ZONE = "UTC";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const instant = (day: number, minute: number): string =>
  new Date(Date.parse(WEEK_START) + day * DAY_MS + minute * MINUTE_MS).toISOString();

const colorOf = (data: GalleryData, projectId: null | string): ProjectColorName =>
  data.projects.find((project) => project.id === projectId)?.color ?? "blue";

const metaOf = (task: GalleryTask): readonly MetaPart[] => [
  { importance: task.importance, kind: "importance" },
  ...(task.isRepeating ? [{ kind: "repeats" } as const] : []),
  ...(task.leftMinutes === null ? [] : [{ kind: "left", minutes: task.leftMinutes } as const]),
  ...(task.subtasksLeft > 0 ? [{ count: task.subtasksLeft, kind: "subtasks-left" } as const] : []),
];

/** The rows every task list shows (Now, a project, History). */
export const nowRows = (data: GalleryData): readonly NowRow[] =>
  data.tasks.map((task) => {
    const project = data.projects.find((candidate) => candidate.id === task.projectId);
    return {
      color: colorOf(data, task.projectId),
      dimmed: task.isDimmed,
      dueAt: null,
      id: task.id,
      importance: task.importance,
      meta: metaOf(task),
      progress: 0,
      projectId: task.projectId,
      tag:
        project === undefined
          ? { kind: "preset", name: "Personal", presetId: "personal" }
          : { kind: "project", name: project.name },
      title: task.title,
    };
  });

/** One chip per project, the way the Now filter lists them. */
export const projectChips = (data: GalleryData): readonly ProjectChip[] =>
  data.projects.map((project) => ({
    color: project.color,
    id: project.id,
    name: project.name,
    open: data.tasks.filter((task) => task.projectId === project.id).length,
  }));

const runningView = (running: GalleryRunning, isAlongside: boolean): RunningView => ({
  activityId: isAlongside ? "alongside" : "main",
  category: running.category,
  color: projectHue(running.color),
  expectMinutes: running.expectMinutes,
  isAlongside,
  label: running.label,
  minutes: running.minutes,
  remindAt: null,
  share:
    running.expectMinutes === null
      ? null
      : Math.min(1, running.minutes / Math.max(1, running.expectMinutes)),
  startAt: GALLERY_NOW,
  status: running.expectMinutes !== null && running.minutes > running.expectMinutes ? "long" : "ok",
  taskId: null,
});

/** The running activities: the main one, then what runs alongside it. */
export const runningViews = (data: GalleryData): readonly RunningView[] => [
  ...(data.running === null ? [] : [runningView(data.running, false)]),
  ...(data.alongside === null ? [] : [runningView(data.alongside, true)]),
];

const weekBlock = (block: GalleryBlock): WeekBlock => ({
  category: block.category,
  color: projectHue(block.color),
  endAt: instant(block.day, block.startMinute + block.minutes),
  height: block.minutes,
  id: block.id,
  isAlongside: block.isAlongside,
  label: block.label,
  minutes: block.minutes,
  startAt: instant(block.day, block.startMinute),
  taskId: null,
  top: block.startMinute,
});

/** The week the blocks sit in, Monday to Sunday, today on the Wednesday. */
export const weekModel = (data: GalleryData): WeekModel => {
  const earliest = Math.min(7 * 60, ...data.blocks.map((block) => block.startMinute));
  return {
    days: Array.from({ length: 7 }, (_, day) => ({
      blocks: data.blocks.filter((block) => block.day === day).map((block) => weekBlock(block)),
      date: instant(day, 0),
      isToday: day === 2,
    })),
    fromHour: Math.floor(earliest / 60),
    isCurrent: true,
    next: null,
    previous: instant(-7, 0),
    weekEnd: instant(7, 0),
    weekStart: WEEK_START,
    zone: GALLERY_ZONE,
  };
};

/** The blocks of Monday as the Day screen lists them. */
export const dayRows = (data: GalleryData): readonly DayRow[] =>
  data.blocks
    .filter((block) => block.day === 0 || data.blocks.length === 1)
    .map((block) => ({
      activityId: block.id,
      category: block.category,
      color: projectHue(block.color),
      endAt: instant(block.day, block.startMinute + block.minutes),
      expectMinutes: block.minutes > 1 ? block.minutes : null,
      isAlongside: block.isAlongside,
      isLogged: true,
      isRunning: false,
      label: block.label,
      minutes: block.minutes,
      showsLabel: block.label !== "",
      startAt: instant(block.day, block.startMinute),
      taskId: null,
      taskLink: null,
    }));

/** The ways into the account, as the sessions list gives them. */
export const sessionRows = (data: GalleryData): readonly SessionRow[] =>
  data.sessions.map((session) => ({
    action: session.kind === "agent" ? "disconnect" : "revoke",
    id: session.id,
    isCurrent: false,
    kind: session.kind,
    meta: session.meta,
    name: session.name,
  }));

/** The captures waiting to be sorted, each with its guess. */
export const inboxCards = (data: GalleryData): readonly InboxCard[] =>
  data.inboxTexts.map((text, index) => ({
    ageMinutes: 5 + index,
    chips: [],
    id: `inbox-${String(index)}`,
    suggestion: {
      dueAt: null,
      dueTz: null,
      importance: "normal",
      presetId: "personal",
      projectId: data.projects[0]?.id ?? null,
    },
    text,
    tooLong: text.length > 500,
  }));

/** The sign-in notice of the feed. */
export const signInNotification = (data: GalleryData): null | PoolNotification =>
  data.signIn === null
    ? null
    : {
        createdAt: GALLERY_NOW,
        id: "notification-login",
        kind: "login",
        payload: {
          city: data.signIn.city,
          country: data.signIn.country,
          ip: data.signIn.ip,
          kind: "browser",
          name: data.signIn.name,
          sessionId: "gallery-session",
        },
        readAt: null,
        resolution: null,
        resolvedAt: null,
      };

/** The task screen's model: the first task with the set's subtasks, every solved one to be sent. */
export const taskModel = (data: GalleryData): null | TaskViewModel => {
  const task = data.tasks[0];
  if (task === undefined) {
    return null;
  }
  const project = data.projects.find((candidate) => candidate.id === task.projectId) ?? null;
  const solved = data.subtasks.filter((subtask) => subtask.isSolved);
  return {
    category: { color: colorOf(data, null), id: "personal", name: "Personal" },
    closed: null,
    createdAt: instant(0, 0),
    description: data.description,
    id: task.id,
    link: data.link === null ? null : { host: "example.com", url: data.link },
    outcome: null,
    overrideSheet: {
      dueAt: null,
      dueTz: null,
      estimateMinutes: 0,
      importance: task.importance,
      isEstimateOwn: false,
      isImportanceOwn: false,
      overrides: null,
      presetId: "personal",
      presetName: "Personal",
      presets: [{ builtIn: true, id: "personal", name: "Personal" }],
    },
    primaryAction:
      solved.length === 0
        ? { kind: "done" }
        : { kind: "submit", subtaskIds: solved.map((subtask) => subtask.id) },
    progress: { mode: "subtasks", slider: null, value: 0 },
    project: project === null ? null : { color: project.color, id: project.id, name: project.name },
    quickTimes: [],
    sourceText: null,
    stats: {
      deadlinePolicy: { kind: "hard" },
      dueAt: null,
      dueTz: null,
      dueZoneDiffers: false,
      estimateMinutes: 0,
      finalDue: null,
      repeat: null,
      startAt: instant(0, 0),
      startTz: null,
      trackedMinutes: 0,
      workLeftMinutes: 0,
    },
    submitVia: null,
    subtasks: data.subtasks.map((subtask) => ({
      id: subtask.id,
      label: subtask.label,
      number: subtask.number,
      solvedAt: subtask.isSolved ? instant(1, 0) : null,
      state: subtask.isSolved ? "solved" : "pending",
      submittedAt: null,
    })),
    tags: [{ importance: task.importance, kind: "importance" }],
    title: task.title,
  };
};
