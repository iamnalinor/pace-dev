import type { Page, WebSocketRoute } from "@playwright/test";

import { formByHand, nowTasks, taskForm } from "./support/composer.ts";
import { EMPTY_COPY } from "./support/first-sync.ts";
import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { API_URL, loginViaApi } from "./support/login.ts";
import { isBare, screenUrls, STAND_IN_IDS } from "./support/routes.ts";
import { settle } from "./support/screen-checks.ts";
import { type LivedIn, seedLivedIn } from "./support/seed.ts";
import { recordSyncTraffic, repeated } from "./support/sync-traffic.ts";

/** The titles of the tasks created in the server's log of the account behind `token`. */
const serverTitles = async (token: string): Promise<readonly string[]> => {
  const response = await fetch(`${API_URL}/api/sync/pull?since=0&limit=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { events } = (await response.json()) as {
    readonly events: readonly {
      readonly type: string;
      readonly payload: { readonly title?: string };
    }[];
  };
  return events
    .filter((event) => event.type === "task.created")
    .map((event) => event.payload.title ?? "");
};

test("the first sync of an empty copy shows placeholders, never the empty states, then the account's language (QA 17 M4)", async ({
  page,
}) => {
  // A Russian account in an English browser, on a device with nothing local (new browser).
  const { token } = await loginViaApi(page);
  await seedLivedIn(token);
  await page.route("**/api/sync/pull**", async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
    await route.continue();
  });
  // Every text the page shows while it loads, taken at each change of the page.
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(globalThis, { seenTexts: seen });
    new MutationObserver(() => {
      const body = document.querySelector("body");
      // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- innerText leaves out what is not drawn (the covered app); textContent keeps it
      seen.push(body === null ? "" : body.innerText);
    }).observe(document, { characterData: true, childList: true, subtree: true });
  });
  await page.goto("/");
  const placeholder = page.getByRole("progressbar", { name: "Syncing your data" });
  await expect(placeholder).toBeVisible();
  await expectNoA11yViolations(page);
  await expect(page.getByRole("heading", { name: "Сейчас" })).toBeVisible({ timeout: 10_000 });
  // Nothing final showed while the pull waited, and no English navigation before the Russian.
  const seen = await page.evaluate(
    () => (globalThis as unknown as { seenTexts: string[] }).seenTexts,
  );
  expect(seen.filter((text) => EMPTY_COPY.test(text) || /\bInbox\b/u.test(text))).toEqual([]);
  await expect(placeholder).toHaveCount(0);
});

test("a first sync that outlasts the cover shows no final empty copy in either language (QA 18 M5)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { token } = await loginViaApi(page);
  await seedLivedIn(token);
  // Longer than the cover's 10 s: the app is given back while the pull still waits.
  await page.route("**/api/sync/pull**", async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 12_000);
    });
    await route.continue();
  });
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(globalThis, { seenTexts: seen });
    new MutationObserver(() => {
      const body = document.querySelector("body");
      // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- innerText leaves out what is not drawn (the covered app); textContent keeps it
      seen.push(body === null ? "" : body.innerText);
    }).observe(document, { characterData: true, childList: true, subtree: true });
  });
  await page.goto("/");
  // The cover says what it waits for, in words.
  await expect(page.getByText("Syncing your data…")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Still syncing" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: "Сейчас" })).toBeVisible({ timeout: 20_000 });
  const seen = await page.evaluate(
    () => (globalThis as unknown as { seenTexts: string[] }).seenTexts,
  );
  expect(seen.filter((text) => EMPTY_COPY.test(text))).toEqual([]);
});

/** The first sync's cover lasts this long at most (`FIRST_SYNC_COVER_MS` in the app's sync frame). */
const COVER_MS = 10_000;

/** A URL of `screenUrls(STAND_IN_IDS)` with the seeded account's ids in. */
const withIds = (url: string, seeded: LivedIn): string => {
  const [, kind, id] = /^\/(task|project)\/(.+)$/u.exec(url) ?? [];
  const key = (Object.keys(STAND_IN_IDS) as (keyof LivedIn)[]).find(
    (name) => STAND_IN_IDS[name] === id,
  );
  return kind === undefined || key === undefined ? url : `/${kind}/${seeded[key]}`;
};

/**
Every screen a signed-in person reads data on, from the router's folder (QA rounds 18 M5, 19 M1
and 20 M1 each fixed the screens the last round named, and the next round found another: bug-lessons
class 90). Signing in and the walk-through send a signed-in person on.
*/
const DATA_URLS = screenUrls(STAND_IN_IDS).filter((url) => !isBare(url));

/** The switches and choices the page draws, as `role:name`. */
const drawnChoices = async (page: Page): Promise<readonly string[]> =>
  await page
    .locator('[role="switch"], [role="radio"], [role="checkbox"]')
    .evaluateAll((elements) =>
      elements.map(
        (element) =>
          `${element.getAttribute("role") ?? ""}:${element.getAttribute("aria-label") ?? element.textContent}`,
      ),
    );

/**
Choices a screen may draw while the account's log is away, each with why, matched on `url role:name`.
*/
const NOT_ACCOUNT_VALUES: readonly { readonly match: RegExp; readonly why: string }[] = [
  {
    match: /^\/settings radio:(?:System|Light|Dark)$/u,
    why: "the theme is this device's own choice, kept on the device, not in the account",
  },
  {
    match: /^\/add radio:/u,
    why: "open (round 6-D, for the owner): a share opens New task's form at once, its presets and projects the built-in ones until the log arrives",
  },
];

for (const url of DATA_URLS) {
  test(`${url} during a first sync that outlasts the cover shows no empty copy, zero total or account value and writes nothing (QA 19 M1, 20 M1)`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // A Russian account in an English browser, on a device with nothing local (new browser).
    const { token } = await loginViaApi(page);
    const seeded = await seedLivedIn(token);
    const pull = Promise.withResolvers<null>();
    await page.route("**/api/sync/pull**", async (route) => {
      await pull.promise;
      await route.continue();
    });
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/sync/push")) {
        writes.push(request.postData() ?? "");
      }
    });
    page.on("websocket", (socket) => {
      socket.on("framesent", ({ payload }) => {
        if (String(payload).includes('"type":"push"')) {
          writes.push(String(payload));
        }
      });
    });
    await page.addInitScript(() => {
      const seen: string[] = [];
      Object.assign(globalThis, { seenTexts: seen });
      new MutationObserver(() => {
        const body = document.querySelector("body");
        // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- innerText leaves out what is not drawn (the covered app); textContent keeps it
        seen.push(body === null ? "" : body.innerText);
      }).observe(document, { characterData: true, childList: true, subtree: true });
    });
    // The cover's ten seconds pass on the page's clock, not the test's.
    await page.clock.install();
    await page.goto(withIds(url, seeded));
    await expect(page.getByRole("progressbar", { name: "Syncing your data" })).toBeVisible();
    await page.clock.fastForward(COVER_MS + 1000);
    const line = page.getByRole("status").filter({ hasText: "Still syncing" });
    await expect(line).toBeVisible();
    // The app is given back while the log is still away: what it draws then is judged.
    await settle(page);
    const seen = await page.evaluate(
      () => (globalThis as unknown as { seenTexts: string[] }).seenTexts,
    );
    expect(seen.filter((text) => EMPTY_COPY.test(text))).toEqual([]);
    expect(writes).toEqual([]);
    // No control draws a value the account has not sent yet (a switch, a choice).
    expect(
      (await drawnChoices(page)).filter((choice) =>
        NOT_ACCOUNT_VALUES.every(({ match }) => !match.test(`${url} ${choice}`)),
      ),
    ).toEqual([]);
    pull.resolve(null);
    await expect(line).toHaveCount(0, { timeout: 20_000 });
    // Once the account's data is in, nothing drawn from defaults is written over it (QA 20 M1).
    expect(writes.filter((body) => body.includes("settings.updated"))).toEqual([]);
  });
}

test("offline, a line says so; a task written meanwhile goes out on reconnect and the line clears (QA 17 M5)", async ({
  context,
  page,
}) => {
  const { token } = await loginViaApi(page);
  const traffic = recordSyncTraffic(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  const line = page.getByRole("status").filter({ hasText: "You are offline" });
  await expect(line).toHaveCount(0);
  await context.setOffline(true);
  await expect(line).toBeVisible();
  await formByHand(page).click();
  const form = taskForm(page);
  await form.getByRole("textbox", { exact: true, name: "Title" }).fill("Buy stamps offline");
  await form.getByRole("textbox", { exact: true, name: "Title" }).press("Enter");
  await expect(nowTasks(page).getByText("Buy stamps offline")).toBeVisible();
  await expectNoA11yViolations(page);
  await context.setOffline(false);
  await expect(line).toHaveCount(0);
  // It reached the server: the server's own log holds it (a reload would read IndexedDB, review m6).
  await expect.poll(async () => await serverTitles(token)).toContain("Buy stamps offline");
  // The steady state (fix round 5 V6): back online, nothing is sent again for the same change.
  const after = await traffic.over(3000);
  expect(after.frames.filter((frame) => frame.includes('"type":"push"'))).toEqual([]);
  expect(after.calls.filter((call) => call.startsWith("POST"))).toEqual([]);
  expect(repeated(after.calls)).toEqual([]);
});

for (const [width, height] of [
  [390, 844],
  [1440, 900],
] as const) {
  test(`going offline and back moves nothing on the page at ${String(width)} (QA 18 L11)`, async ({
    context,
    page,
  }) => {
    await page.setViewportSize({ height, width });
    await loginViaApi(page);
    await page.goto("/");
    const heading = page.getByRole("heading", { name: "Now" });
    await expect(heading).toBeVisible();
    const before = await heading.boundingBox();
    await context.setOffline(true);
    const line = page.getByRole("status").filter({ hasText: "You are offline" });
    await expect(line).toBeVisible();
    expect(await heading.boundingBox()).toEqual(before);
    // The pill keeps to the top of the page, under the browser's bar, and is no wider than it.
    const pill = await line.boundingBox();
    expect(pill?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((pill?.x ?? 0) + (pill?.width ?? 0)).toBeLessThanOrEqual(width);
    await expectNoA11yViolations(page);
    await context.setOffline(false);
    await expect(line).toHaveCount(0);
    expect(await heading.boundingBox()).toEqual(before);
  });
}

test("a server gone while the tab sits idle: the line says offline without a write, and clears once it is back (QA 18 M4)", async ({
  page,
}) => {
  await loginViaApi(page);
  // The server's reachability as the page sees it: its socket and every API call.
  const server = { isDown: false };
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/api\/sync\/live/u, async (socket) => {
    if (server.isDown) {
      await socket.close();
      return;
    }
    socket.connectToServer();
    sockets.push(socket);
  });
  await page.route(/\/api\//u, async (route) => {
    await (server.isDown ? route.abort("connectionrefused") : route.fallback());
  });
  const traffic = recordSyncTraffic(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  const line = page.getByRole("status").filter({ hasText: "You are offline" });
  await expect.poll(() => sockets.length).toBeGreaterThan(0);
  await expect(line).toHaveCount(0);
  // The socket's opening asks for one catch-up pull (what landed before it was there), now the
  // only run after the signed-in start's own (QA 20 L9): it goes within a second of the opening.
  await expect
    .poll(() => traffic.calls.filter((call) => call.startsWith("GET /api/sync/pull")))
    .not.toEqual([]);
  // An idle tab: its socket has been up a while (one cut at once is a flapping link, which backs
  // off without a check, fix round 5 V2), and it sends nothing meanwhile.
  const idle = await traffic.over(6000);
  expect(idle.calls).toEqual([]);

  server.isDown = true;
  for (const socket of sockets.splice(0)) {
    await socket.close();
  }
  // Nothing written: the dropped socket alone has the app look, well before the 30 s poll.
  await expect(line).toBeVisible({ timeout: 5000 });
  // While it is down, no storm: the reconnects back off 1, 2, 4 s, and so do the runs.
  const down = await traffic.over(5000);
  expect(down.calls.length).toBeLessThanOrEqual(4);

  server.isDown = false;
  await expect(line).toHaveCount(0, { timeout: 20_000 });
  // Back: the network goes quiet, nothing asked twice (fix round 5 V6).
  const back = await traffic.over(3000);
  expect(back.calls.length).toBeLessThanOrEqual(1);
  expect(repeated(back.calls)).toEqual([]);
});

test("Settings and Presets show no account value and write nothing during a first sync that outlasts the cover (QA 20 M1)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // A Russian account in an English browser: a default drawn as the account's would read English.
  const { token } = await loginViaApi(page);
  await seedLivedIn(token);
  const pushed: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/sync/push")) {
      pushed.push(request.postData() ?? "");
    }
  });
  await page.route("**/api/sync/pull**", async (route) => {
    await new Promise((resolve) => {
      setTimeout(resolve, 12_000);
    });
    await route.continue();
  });
  await page.goto("/settings");
  await expect(page.getByRole("status").filter({ hasText: "Still syncing" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("progressbar", { name: "Loading your data…" }).first()).toBeVisible();
  await expect(page.getByRole("radio", { name: "English" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Show night hours" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  await page
    .getByRole("link", { name: "Presets" })
    .or(page.getByRole("button", { name: "Presets" }))
    .first()
    .click();
  await expect(page.getByRole("button", { name: "Add example course presets" })).toHaveCount(0);
  // Once the account's data is in, its own values show, and nothing was written meanwhile.
  await expect(page.getByRole("status").filter({ hasText: /Still syncing/u })).toHaveCount(0, {
    timeout: 20_000,
  });
  await page.goto("/settings");
  await expect(page.getByRole("radio", { name: "Русский" })).toBeChecked();
  expect(pushed.filter((body) => body.includes("settings.updated"))).toEqual([]);
});

test("a server back after a long outage: Retry and a return to the window clear the line at once (QA 20 L2)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await loginViaApi(page);
  const server = { isDown: false };
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/api\/sync\/live/u, async (socket) => {
    if (server.isDown) {
      await socket.close();
      return;
    }
    socket.connectToServer();
    sockets.push(socket);
  });
  await page.route(/\/api\//u, async (route) => {
    await (server.isDown ? route.abort("connectionrefused") : route.fallback());
  });
  const traffic = recordSyncTraffic(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Now" })).toBeVisible();
  await expect.poll(() => sockets.length).toBeGreaterThan(0);
  const line = page.getByRole("status").filter({ hasText: "You are offline" });
  const waysBack = [
    async () => {
      await line.getByRole("button", { name: "Retry" }).click();
    },
    async () => {
      await page.evaluate(() => {
        globalThis.dispatchEvent(new Event("focus"));
      });
    },
  ];
  for (const comeBack of waysBack) {
    // Its socket up a while first: one cut at once is a flapping link, which backs off without a
    // check (fix round 5 V2).
    await traffic.over(6000);
    server.isDown = true;
    for (const socket of sockets.splice(0)) {
      await socket.close();
    }
    await expect(line).toBeVisible({ timeout: 5000 });
    // An outage long enough for the backoff to reach well past ten seconds, and no storm in it.
    const down = await traffic.over(20_000);
    expect(down.calls.length).toBeLessThanOrEqual(6);
    server.isDown = false;
    await comeBack();
    await expect(line).toHaveCount(0, { timeout: 3000 });
  }
});

test("the first load asks for each thing once: one pull of the log, one of the pool, one of today's calendar (QA 20 L9)", async ({
  page,
}) => {
  // An account that has its time zone already: the start writes nothing of its own.
  const { token } = await loginViaApi(page);
  await seedLivedIn(token);
  const asked: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/^\/api\/(?:sync\/pull|notifications|calendar)$/u.test(url.pathname)) {
      asked.push(`${url.pathname}${url.pathname === "/api/sync/pull" ? url.search : ""}`);
    }
  });
  const traffic = recordSyncTraffic(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Сейчас" })).toBeVisible({ timeout: 15_000 });
  // The socket's first connection and the loop's first tick come within this window.
  await traffic.over(3000);
  expect(repeated(asked)).toEqual([]);
  expect(asked.filter((call) => call.includes("since=0"))).toHaveLength(1);
});
