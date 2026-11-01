import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { en } from "@pace/core/i18n/en";
import { ru } from "@pace/core/i18n/ru";

import { expect, test } from "./support/fixtures.ts";
import { createDevSession, resetAccount } from "./support/login.ts";
import { type LivedIn, pushAsClient, seedLivedIn, ulid } from "./support/seed.ts";

/**
The design review matrix: every route, plus the sheets, dialogs, pickers, toasts, empty, loading,
error and offline states it can reach, at 1440×900 and 390×844, light and dark, English and
Russian, and a keyboard-focus pass. Off by default; run with
`DESIGN_SHOTS=context/design/baseline bun test:e2e e2e/design-shots.e2e.ts` to (re)shoot the set
after a design batch. A shot that cannot be reached is listed in `manifest-<combo>.json` with the
reason instead of failing the run, so one renamed label does not cost the whole matrix.
*/
const SHOT_DIR = process.env["DESIGN_SHOTS"];

/** A comma-separated environment list, or undefined when the variable is not set. */
const listEnv = (name: string): readonly string[] | undefined => {
  const value = process.env[name];
  return value === undefined ? undefined : value.split(",");
};

/** Groups to shoot (routes, scroll, empty, states, signed-out, focus); all by default. */
const ONLY = listEnv("DESIGN_SHOTS_ONLY");
/** State names to shoot (all by default), for re-shooting one overlay. */
const ONLY_STATES = listEnv("DESIGN_SHOTS_STATES");

type Lang = "en" | "ru";
type Theme = "dark" | "light";
type Size = { readonly name: "desktop" | "phone"; readonly width: number; readonly height: number };
type Combo = { readonly lang: Lang; readonly size: Size; readonly theme: Theme };

const SIZES: readonly Size[] = [
  { height: 900, name: "desktop", width: 1440 },
  { height: 844, name: "phone", width: 390 },
];
const THEMES: readonly Theme[] = ["light", "dark"];
const LANGS: readonly Lang[] = ["en", "ru"];
const COMBOS: readonly Combo[] = SIZES.flatMap((size) =>
  THEMES.flatMap((theme) => LANGS.map((lang) => ({ lang, size, theme }))),
);
const ZONE = "Europe/Moscow";

/** Ids of their own for the matrix (the e2e Worker whitelists 3000–3399): two per combo. */
const ID_BASE = 3300;

const CATALOG: Readonly<Record<Lang, Readonly<Record<string, string>>>> = { en, ru };

const escape = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

type LabelOptions = { readonly prefix?: boolean };

/**
An English label as it reads in `lang`: every catalog key whose English text is `label`, so a
label shared by several keys matches any of their translations. Exact by default; `{ prefix }`
matches labels that start with it (dynamic tails such as counts).
*/
const label = (lang: Lang, text: string, options: LabelOptions = {}): RegExp => {
  const keys = Object.keys(en).filter((key) => CATALOG.en[key] === text);
  const variants = keys.length === 0 ? [text] : keys.map((key) => CATALOG[lang][key] ?? text);
  const body = [...new Set(variants)].map((variant) => escape(variant)).join("|");
  // eslint-disable-next-line security/detect-non-literal-regexp -- built from regex-escaped catalog strings of this repo, never from user input
  return new RegExp(options.prefix === true ? `^(?:${body})` : `^(?:${body})$`, "u");
};

const day = (at: number): string => new Date(at).toISOString();

/**
A pause for a shot: motion, a toast or a sync has to be at a known point when the page is shot, and
there is no observable condition for "the animation is 250 ms in".
*/
const pause = async (page: Page, milliseconds: number): Promise<void> => {
  // eslint-disable-next-line playwright/no-wait-for-timeout, sonarjs/no-fixed-wait-in-tests -- screenshots capture timed UI (motion, toasts, debounce); no DOM condition marks the moment
  await page.waitForTimeout(milliseconds);
};

/** `settings.updated` with the account's language, so a seeded account reads in `lang`. */
const setLanguage = async (token: string, lang: Lang): Promise<void> => {
  const now = Date.now();
  const response = await pushAsClient(token, [
    {
      deviceId: "design-shots",
      id: ulid(now),
      occurredAt: day(now),
      payload: { language: lang, timezone: ZONE },
      precision: "exact",
      recordedAt: day(now),
      source: "web",
      type: "settings.updated",
    },
  ]);
  expect(response.ok).toBe(true);
};

/** A reset account that reads in `lang`: nothing on it, what a new person meets first. */
const freshAccount = async (id: number, lang: Lang): Promise<string> => {
  await resetAccount(String(id));
  const { token } = await createDevSession(String(id));
  await setLanguage(token, lang);
  return token;
};

/** A reset account with a lived-in week on it (tasks, blocks, a series, a preset). */
const livedAccount = async (
  id: number,
  lang: Lang,
): Promise<{ readonly seeded: LivedIn; readonly token: string }> => {
  await resetAccount(String(id));
  const { token } = await createDevSession(String(id));
  const seeded = await seedLivedIn(token);
  await setLanguage(token, lang);
  return { seeded, token };
};

const newContext = async (
  browser: Browser,
  { lang, size, theme }: Combo,
  token: string | undefined,
): Promise<BrowserContext> => {
  const context = await browser.newContext({
    colorScheme: theme,
    hasTouch: size.name === "phone",
    isMobile: size.name === "phone",
    locale: lang === "ru" ? "ru-RU" : "en-US",
    timezoneId: ZONE,
    viewport: { height: size.height, width: size.width },
  });
  // A missing control must fail its shot fast, not hold the combo until the test times out.
  context.setDefaultTimeout(6000);
  await context.addInitScript(
    ({ session, value }) => {
      if (session !== undefined) {
        localStorage.setItem("pace.session", session);
      }
      localStorage.setItem("pace.theme", value);
    },
    { session: token, value: theme },
  );
  return context;
};

/** The page's visible text, empty while the page is navigating. */
const bodyText = async (page: Page): Promise<string> => {
  try {
    return await page.locator("body").innerText();
  } catch {
    return "";
  }
};

/** Waits until the page's text stops changing (the store hydrates, sync settles, motion ends). */
const settle = async (page: Page, quiet = 600): Promise<void> => {
  const state = { previous: "", stable: 0 };
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const now = await bodyText(page);
    state.stable = now === state.previous && now.length > 0 ? state.stable + 1 : 0;
    state.previous = now;
    if (state.stable >= 2) {
      break;
    }
    await pause(page, 200);
  }
  await pause(page, quiet);
};

type Shot = { readonly file: string; readonly ok: boolean; readonly note?: string };

type Recorder = {
  readonly shots: readonly Shot[];
  readonly take: (page: Page, group: string, name: string) => Promise<void>;
  readonly miss: (group: string, name: string, note: string) => void;
  readonly write: () => void;
};

const makeDirectory = (directory: string): void => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the folder is the DESIGN_SHOTS value of the person running the matrix
  mkdirSync(directory, { recursive: true });
};

const writeText = (file: string, text: string): void => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the folder is the DESIGN_SHOTS value of the person running the matrix
  writeFileSync(file, text);
};

const createRecorder = (root: string, combo: string): Recorder => {
  const shots: Shot[] = [];
  return {
    miss: (group, name, note) => {
      shots.push({ file: `${group}/${name}--${combo}.png`, note, ok: false });
    },
    shots,
    take: async (page, group, name) => {
      const directory = path.join(root, group);
      makeDirectory(directory);
      const file = path.join(directory, `${name}--${combo}.png`);
      await page.screenshot({ path: file });
      shots.push({ file: path.relative(root, file), ok: true });
    },
    write: () => {
      makeDirectory(root);
      writeText(path.join(root, `manifest-${combo}.json`), `${JSON.stringify(shots, null, 2)}\n`);
    },
  };
};

/** Runs one shot's steps; a step that cannot find its control records the miss and moves on. */
const attempt = async (
  recorder: Recorder,
  shot: { readonly group: string; readonly name: string },
  run: () => Promise<void>,
): Promise<void> => {
  try {
    await run();
  } catch (error) {
    recorder.miss(shot.group, shot.name, String(error).split("\n", 1)[0] ?? "unknown");
  }
};

const shouldRun = (group: string): boolean => ONLY === undefined || ONLY.includes(group);

type RouteList = readonly (readonly [string, string])[];

/** Every route file under apps/app/app as the URLs that open it on the seeded account. */
const routes = (seeded: LivedIn): RouteList => [
  ["now", "/"],
  ["day", "/day"],
  ["week", "/week"],
  ["inbox", "/inbox"],
  ["more", "/more"],
  ["add", "/add"],
  ["projects", "/projects"],
  ["project", `/project/${seeded.algebraId}`],
  ["presets", "/presets"],
  ["preset", "/presets/hw.seeded"],
  ["task-open", `/task/${seeded.openTaskId}`],
  ["task-done", `/task/${seeded.doneTaskId}`],
  ["task-repeating", `/task/${seeded.repeatingTaskId}`],
  ["decisions", "/decisions"],
  ["review", "/review"],
  ["history", "/history"],
  ["insights", "/insights"],
  ["notifications", "/notifications"],
  ["settings", "/settings"],
  ["permissions", "/permissions"],
  ["onboarding", "/onboarding"],
  ["oauth-authorize", "/oauth/authorize"],
  ["app-auth", "/app/auth"],
  ["app-login", "/app/login"],
  ["auth", "/auth"],
  ["auth-telegram", "/auth/telegram"],
  ["not-found", "/no-such-page"],
];

/** Screens worth seeing on an empty account: what a new person meets first. */
const EMPTY_ROUTES: RouteList = [
  ["now", "/"],
  ["day", "/day"],
  ["week", "/week"],
  ["inbox", "/inbox"],
  ["projects", "/projects"],
  ["presets", "/presets"],
  ["insights", "/insights"],
  ["history", "/history"],
  ["notifications", "/notifications"],
  ["decisions", "/decisions"],
  ["review", "/review"],
  ["settings", "/settings"],
];

/** Screens without an account: the browser's language decides theirs. */
const SIGNED_OUT_ROUTES: RouteList = [
  ["login", "/login"],
  ["app-login", "/app/login"],
  ["app-auth", "/app/auth"],
  ["auth", "/auth"],
  ["oauth-authorize", "/oauth/authorize"],
  ["not-found", "/no-such-page"],
];

/** Scrolls the page's main scroller (the tallest scrollable box) one screen; false at its end. */
const hasScrolled = async (page: Page): Promise<boolean> =>
  await page.evaluate(() => {
    const boxes = [...globalThis.document.querySelectorAll<HTMLElement>("body *")].filter(
      (element) => {
        const style = globalThis.getComputedStyle(element);
        return (
          /auto|scroll/u.test(style.overflowY) &&
          element.scrollHeight > element.clientHeight + 40 &&
          element.clientHeight > 200
        );
      },
    );
    const scroller = boxes.toSorted((a, b) => b.clientHeight - a.clientHeight)[0];
    if (scroller === undefined) {
      return false;
    }
    const before = scroller.scrollTop;
    scroller.scrollBy({ behavior: "instant", top: scroller.clientHeight * 0.85 });
    return scroller.scrollTop > before;
  });

const SCROLL_FRAMES = 3;
const FRAME_NUMBERS = Array.from({ length: SCROLL_FRAMES }, (_, index) => index + 1);

/** Shoots each further screen of a long route (up to `SCROLL_FRAMES`), so it is reviewed whole. */
const scrollFrames = async (page: Page, recorder: Recorder, name: string): Promise<void> => {
  for (const frame of FRAME_NUMBERS) {
    if (!(await hasScrolled(page))) {
      return;
    }
    await pause(page, 400);
    await recorder.take(page, "scroll", `${name}-${String(frame)}`);
  }
};

const first = (locator: Locator): Locator => locator.first();

type Ctx = {
  readonly page: Page;
  readonly lang: Lang;
  readonly size: Size;
  readonly seeded: LivedIn;
  readonly L: (text: string, options?: LabelOptions) => RegExp;
};

type State = {
  readonly name: string;
  readonly only?: Size["name"];
  readonly run: (ctx: Ctx) => Promise<void>;
};

const open = async (page: Page, url: string): Promise<void> => {
  await page.goto(url);
  await settle(page, 300);
};

/** The time bar sits on Now; on a phone it is folded under "Start something else". */
const openTimeBar = async ({ page, L, size }: Ctx): Promise<void> => {
  await open(page, "/");
  if (size.name !== "phone") {
    return;
  }

  await first(page.getByRole("button", { name: L("Start something else") })).click();
  await pause(page, 500);
};

const SECTION_LOADING_ROUTE = "**/api/sessions**";
const SESSIONS_TITLE = /^(?:Devices and sessions|Устройства и сеансы)$/u;

const scrollToSessions = async (page: Page): Promise<void> => {
  await first(page.getByText(SESSIONS_TITLE)).scrollIntoViewIfNeeded();
  await pause(page, 300);
};

/** Lets a held request through once the page has been shot, unless the page is already gone. */
const continueQuietly = async (route: {
  readonly continue: () => Promise<void>;
}): Promise<void> => {
  try {
    await route.continue();
  } catch {
    // The context was closed while the request was held: nothing left to answer.
  }
};

/** "00:00 – now": the time column that starts every block and every gap on the Day timeline. */
const TIME_RANGE = /\d{1,2}:\d{2}\s*–/u;
/** How many days back the Day shots look for a gap (or a block) when today has none. */
const DAYS_BACK = 3;

/** Goes to the previous day until `wanted` is on screen (at most `left` times). */
const stepBackUntil = async (ctx: Ctx, wanted: Locator, left = DAYS_BACK): Promise<void> => {
  if (left === 0 || (await wanted.count()) > 0) {
    return;
  }
  await first(ctx.page.getByRole("button", { name: ctx.L("Previous day") })).click();
  await settle(ctx.page, 300);
  await stepBackUntil(ctx, wanted, left - 1);
};

/**
The first row of the Day timeline of the given kind. A gap row reads "{duration} not logged" and
ends in the "Log" action, a block row has no such action; both start with their time range. The
seeded blocks sit around "now", so which day holds a gap depends on the hour of the run: the shot
steps back until one is there.
*/
const dayRow = async (ctx: Ctx, kind: "block" | "gap"): Promise<Locator> => {
  const { page, L } = ctx;
  await open(page, "/day");
  const logAction = page.getByText(L("Log"));
  const rows = page.getByRole("button", { name: TIME_RANGE });
  const wanted =
    kind === "gap" ? rows.filter({ has: logAction }) : rows.filter({ hasNot: logAction });
  await stepBackUntil(ctx, wanted);
  return first(wanted);
};

/** The states each combo reaches by hand, in an order that leaves the account usable for the next. */
const STATES: readonly State[] = [
  {
    name: "now-composer-typed",
    run: async ({ page, L }) => {
      await open(page, "/");
      await first(page.getByRole("textbox", { name: L("New task") })).fill(
        "Сдать лабораторную по физике в пятницу к 18:00, 2 часа",
      );
    },
  },
  {
    name: "now-composer-form",
    run: async ({ page, L }) => {
      await open(page, "/");
      await first(page.getByRole("textbox", { name: L("New task") })).fill(
        "Подготовиться к коллоквиуму по матанализу",
      );
      // The composer's own "+" (the sidebar's New task carries the words as text).
      await first(
        page.getByRole("button", { name: L("New task") }).filter({ hasNotText: L("New task") }),
      ).click();
    },
  },
  {
    name: "now-assistant-preview",
    run: async ({ page, L }) => {
      await open(page, "/");
      const line = first(page.getByRole("textbox", { name: L("New task") }));
      await line.fill("Съездить в банк");
      await line.press("Enter");
      await pause(page, 1500);
    },
  },
  {
    name: "now-assistant-question",
    run: async ({ page, L }) => {
      await open(page, "/");
      const line = first(page.getByRole("textbox", { name: L("New task") }));
      await line.fill("#ask Купить подарок маме");
      await line.press("Enter");
      await pause(page, 1500);
    },
  },
  {
    name: "now-in-future",
    run: async ({ page, L }) => {
      await open(page, "/");
      await first(page.getByRole("button", { name: L("In future", { prefix: true }) })).click();
    },
  },
  {
    name: "now-task-pane",
    only: "desktop",
    run: async ({ page }) => {
      await open(page, "/");
      await first(page.getByRole("list").getByRole("link")).click();
    },
  },
  {
    name: "now-calendar-tooltip",
    run: async (ctx) => {
      const { page, L, size } = ctx;
      await openTimeBar(ctx);
      const button = first(page.getByRole("button", { exact: true, name: L("Calendar") }));
      await (size.name === "desktop" ? button.hover() : button.tap());
      await pause(page, 500);
    },
  },
  {
    name: "notifications-feed",
    run: async ({ page, L }) => {
      await open(page, "/");
      await first(page.getByRole("button", { name: L("Notifications") })).click();
    },
  },
  {
    name: "sidebar-new-task",
    only: "desktop",
    run: async ({ page, L }) => {
      await open(page, "/day");
      await page
        .getByRole("navigation")
        .getByRole("button", { name: L("New task") })
        .click();
    },
  },
  {
    name: "day-gap-log",
    run: async (ctx) => {
      await (await dayRow(ctx, "gap")).click();
    },
  },
  {
    name: "day-block-edit",
    run: async (ctx) => {
      await (await dayRow(ctx, "block")).click();
    },
  },
  {
    name: "day-log-past",
    run: async ({ page, L }) => {
      await open(page, "/day");
      await first(page.getByRole("button", { name: L("Log past activity") })).click();
    },
  },
  {
    name: "day-pick-date",
    run: async ({ page, L }) => {
      await open(page, "/day");
      await first(page.getByRole("button", { name: L("Pick a day") })).click();
    },
  },
  {
    name: "day-previous",
    run: async ({ page, L }) => {
      await open(page, "/day");
      await first(page.getByRole("button", { name: L("Previous day") })).click();
      await settle(page, 300);
    },
  },
  {
    name: "time-chores-picker",
    run: async (ctx) => {
      const { page, L } = ctx;
      await openTimeBar(ctx);
      await first(page.getByRole("button", { exact: true, name: L("Chores") })).click();
    },
  },
  {
    name: "time-rest-picker",
    run: async (ctx) => {
      const { page, L } = ctx;
      await openTimeBar(ctx);
      await first(page.getByRole("button", { exact: true, name: L("Rest") })).click();
    },
  },
  {
    name: "time-task-picker",
    run: async (ctx) => {
      const { page, L } = ctx;
      await openTimeBar(ctx);
      await first(page.getByRole("button", { exact: true, name: L("Task") })).click();
    },
  },
  {
    name: "time-typed-preview",
    run: async (ctx) => {
      const { page, L } = ctx;
      await openTimeBar(ctx);
      const field = first(page.getByRole("textbox", { name: L("What are you doing?") }));
      await field.fill("7:30 - 8:30 ходил в военкомат");
      await field.press("Enter");
      await pause(page, 1500);
    },
  },
  {
    name: "time-typed-draft",
    run: async (ctx) => {
      const { page, L } = ctx;
      await openTimeBar(ctx);
      await first(page.getByRole("textbox", { name: L("What are you doing?") })).fill(
        "Пошёл в ЦСС, 20 мин",
      );
    },
  },
  {
    name: "week-event",
    run: async ({ page }) => {
      await open(page, "/week");
      await first(page.getByRole("button", { name: /Собираюсь|Музыка|ЦСС/u })).click();
    },
  },
  {
    name: "task-edit-sheet",
    run: async ({ page, L, seeded }) => {
      await open(page, `/task/${seeded.openTaskId}`);
      await first(page.getByRole("button", { name: L("Edit details") })).click();
    },
  },
  {
    name: "task-close-as",
    run: async ({ page, L, seeded }) => {
      await open(page, `/task/${seeded.openTaskId}`);
      await first(page.getByRole("button", { name: L("Cancel or skip the task…") })).click();
    },
  },
  {
    name: "task-project-picker",
    run: async ({ page, seeded }) => {
      await open(page, `/task/${seeded.openTaskId}`);
      await first(page.getByRole("button", { name: /^(?:Project|Проект)/u })).click();
    },
  },
  {
    name: "task-original-message",
    run: async ({ page, L, seeded }) => {
      await open(page, `/task/${seeded.openTaskId}`);
      await first(page.getByRole("button", { name: L("Original message") })).click();
      await pause(page, 400);
    },
  },
  {
    name: "task-delete-confirm",
    run: async ({ page, L, seeded }) => {
      await open(page, `/task/${seeded.openTaskId}`);
      await first(page.getByRole("button", { name: L("Delete the task") })).click();
    },
  },
  {
    name: "projects-new",
    run: async ({ page, L }) => {
      await open(page, "/projects");
      await first(page.getByRole("button", { name: L("New project") })).click();
    },
  },
  {
    name: "settings-add-computer",
    run: async ({ page, L }) => {
      await open(page, "/settings");
      await first(page.getByRole("button", { name: L("Add a computer") })).click();
    },
  },
  {
    name: "settings-connect-ai",
    run: async ({ page, L }) => {
      await open(page, "/settings");
      await first(page.getByRole("button", { name: L("Connect an AI app") })).click();
    },
  },
  {
    name: "settings-wipe",
    run: async ({ page, L }) => {
      await open(page, "/settings");
      await first(page.getByRole("button", { name: L("Wipe data") })).click();
    },
  },
  {
    name: "settings-sessions-loading",
    run: async ({ page }) => {
      await page.route(SECTION_LOADING_ROUTE, async (route) => {
        await sleep(15_000);
        await continueQuietly(route);
      });
      await page.goto("/settings");
      await pause(page, 1500);
      await scrollToSessions(page);
    },
  },
  {
    name: "settings-sessions-error",
    run: async ({ page }) => {
      await page.route(SECTION_LOADING_ROUTE, async (route) => {
        await route.fulfill({ body: "{}", status: 500 });
      });
      await page.goto("/settings");
      await settle(page, 300);
      await scrollToSessions(page);
    },
  },
  {
    name: "offline",
    run: async ({ page, L }) => {
      await open(page, "/");
      await page.context().setOffline(true);
      const line = first(page.getByRole("textbox", { name: L("New task") }));
      await line.fill("Купить батарейки");
      await line.press("Enter");
      await pause(page, 1500);
      await page.context().setOffline(false);
    },
  },
  {
    name: "toast-to-inbox",
    run: async ({ page, L }) => {
      await open(page, "/");
      await first(page.getByRole("textbox", { name: L("New task") })).fill("Разобрать почту");
      await first(page.getByRole("button", { name: L("To Inbox") })).click();
      await pause(page, 500);
    },
  },
  {
    name: "now-check-dissolve",
    run: async ({ page }) => {
      await open(page, "/");
      await first(page.getByRole("checkbox")).click();
      await pause(page, 250);
    },
  },
  {
    name: "now-check-toast",
    run: async ({ page }) => {
      await open(page, "/");
      await first(page.getByRole("checkbox")).click();
      await pause(page, 1600);
    },
  },
];

/** Tab stops shot on the keyboard pass (desktop only: the phone has no Tab). */
const FOCUS_ROUTES: readonly (readonly [string, (seeded: LivedIn) => string])[] = [
  ["now", () => "/"],
  ["day", () => "/day"],
  ["task", (seeded) => `/task/${seeded.openTaskId}`],
  ["settings", () => "/settings"],
];
const FOCUS_STOPS = [1, 3, 6, 10, 16] as const;

/** Everything one combo's run needs. */
type Run = {
  readonly browser: Browser;
  readonly combo: Combo;
  readonly recorder: Recorder;
  readonly L: Ctx["L"];
  readonly seeded: LivedIn;
  readonly lived: string;
  readonly fresh: string;
};

/** A page in a context of the combo (signed in as `token`, or signed out), closed afterwards. */
const withPage = async (
  { browser, combo }: Run,
  token: string | undefined,
  body: (page: Page) => Promise<void>,
): Promise<void> => {
  const context = await newContext(browser, combo, token);
  try {
    await body(await context.newPage());
  } finally {
    await context.close();
  }
};

/** The routes of one group, visited in one page and shot into the recorder. */
type Tour = {
  readonly group: string;
  readonly list: RouteList;
  readonly page: Page;
  readonly recorder: Recorder;
};

/** Visits every route of the tour, settles, and hands the route's name to `shoot`. */
const visitAll = async (
  { group, list, page, recorder }: Tour,
  shoot: (name: string) => Promise<void>,
): Promise<void> => {
  for (const [name, url] of list) {
    await attempt(recorder, { group, name }, async () => {
      await page.goto(url);
      await settle(page);
      await shoot(name);
    });
  }
};

const shootRoutes = async (run: Run): Promise<void> => {
  const { lived, recorder, seeded } = run;
  await withPage(run, lived, async (page) => {
    const tour = { group: "routes", list: routes(seeded), page, recorder };
    await visitAll(tour, async (name) => {
      if (shouldRun("routes")) {
        await recorder.take(page, "routes", name);
      }
      if (shouldRun("scroll")) {
        await scrollFrames(page, recorder, name);
      }
    });
  });
};

const shootGroup = async (run: Run, group: string, list: RouteList): Promise<void> => {
  const { fresh, recorder } = run;
  await withPage(run, group === "empty" ? fresh : undefined, async (page) => {
    await visitAll({ group, list, page, recorder }, async (name) => {
      await recorder.take(page, group, name);
    });
  });
};

const shootStates = async (run: Run): Promise<void> => {
  const { combo, recorder, seeded, L } = run;
  const wanted = STATES.filter(
    (state) =>
      (state.only === undefined || state.only === combo.size.name) &&
      (ONLY_STATES === undefined || ONLY_STATES.includes(state.name)),
  );
  for (const state of wanted) {
    // A fresh page per state: one state's overlay never leaks into the next shot.
    await withPage(run, run.lived, async (page) => {
      await attempt(recorder, { group: "states", name: state.name }, async () => {
        await state.run({ L, lang: combo.lang, page, seeded, size: combo.size });
        await pause(page, 700);
        await recorder.take(page, "states", state.name);
      });
    });
  }
};

/** Presses Tab `count` times, one after the other. */
const pressTab = async (page: Page, count: number): Promise<void> => {
  if (count <= 0) {
    return;
  }
  await page.keyboard.press("Tab");
  await pressTab(page, count - 1);
};

/** Each focus stop with the Tab presses it takes from the previous one. */
const FOCUS_STEPS = FOCUS_STOPS.map((stop, index) => ({
  presses: stop - (FOCUS_STOPS[index - 1] ?? 0),
  stop,
}));

const shootFocus = async (run: Run): Promise<void> => {
  const { lived, recorder, seeded } = run;
  await withPage(run, lived, async (page) => {
    for (const [name, url] of FOCUS_ROUTES) {
      await attempt(recorder, { group: "focus", name }, async () => {
        await page.goto(url(seeded));
        await settle(page);
        for (const { presses, stop } of FOCUS_STEPS) {
          await pressTab(page, presses);
          await pause(page, 200);
          await recorder.take(page, "focus", `${name}-tab${String(stop)}`);
        }
      });
    }
  });
};

/** The groups of one combo, in the order that leaves each account usable for the next. */
const shootCombo = async (run: Run): Promise<void> => {
  const groups: readonly (readonly [string, () => Promise<void>])[] = [
    [
      "routes",
      async () => {
        await shootRoutes(run);
      },
    ],
    [
      "empty",
      async () => {
        await shootGroup(run, "empty", EMPTY_ROUTES);
      },
    ],
    [
      "signed-out",
      async () => {
        await shootSignedOut(run);
      },
    ],
    [
      "states",
      async () => {
        await shootStates(run);
      },
    ],
    [
      "focus",
      async () => {
        await shootFocus(run);
      },
    ],
  ];
  for (const [group, shoot] of groups) {
    const isOn = group === "routes" ? shouldRun("routes") || shouldRun("scroll") : shouldRun(group);
    const isFocusable = group !== "focus" || run.combo.size.name === "desktop";
    if (isOn && isFocusable) {
      await shoot();
    }
  }
};

const shootSignedOut = async (run: Run): Promise<void> => {
  await shootGroup(run, "signed-out", SIGNED_OUT_ROUTES);
  // The server picker under the sign-in is Android only (features/server/server-line.tsx).
  run.recorder.miss("signed-out", "login-server-picker", "Android only: not on the web build");
};

if (SHOT_DIR !== undefined) {
  const root = path.resolve(SHOT_DIR);
  test.describe.configure({ mode: "parallel" });

  for (const [index, combo] of COMBOS.entries()) {
    const name = `${combo.size.name}-${combo.theme}-${combo.lang}`;

    test(`design shots ${name}`, async ({ browser }) => {
      test.setTimeout(30 * 60_000);
      const recorder = createRecorder(root, name);
      const lived = await livedAccount(ID_BASE + index * 2, combo.lang);
      const fresh = await freshAccount(ID_BASE + index * 2 + 1, combo.lang);
      const run: Run = {
        browser,
        combo,
        fresh,
        L: (text, options) => label(combo.lang, text, options),
        lived: lived.token,
        recorder,
        seeded: lived.seeded,
      };
      try {
        await shootCombo(run);
      } finally {
        recorder.write();
      }
      expect(recorder.shots.length).toBeGreaterThan(0);
    });
  }
}
