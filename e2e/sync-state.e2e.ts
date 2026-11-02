import type { WebSocketRoute } from "@playwright/test";

import { formByHand, nowTasks, taskForm } from "./support/composer.ts";
import { expect, expectNoA11yViolations, test } from "./support/fixtures.ts";
import { API_URL, loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";
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

/**
Final empty states and zero totals the screens show for a log that holds nothing, in either
language (QA round 19 M1 added Day's and the Assistant log's).
*/
const EMPTY_COPY =
  /Nothing to do right now|Сейчас дел нет|Nothing in the log yet|В журнале пока пусто|Nothing recorded|Нет данных|ничего не записано|Tracked 0m|Учтено 0/u;

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

for (const path of ["/day", "/decisions"]) {
  test(`${path} during a first sync that outlasts the cover shows no empty copy or zero total (QA 19 M1)`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
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
    await page.goto(path);
    await expect(page.getByRole("status").filter({ hasText: "Still syncing" })).toBeVisible({
      timeout: 15_000,
    });
    // The app is given back with grey rows standing in for the screen's figures and lists.
    await expect(
      page.getByRole("progressbar", { name: "Loading your data…" }).first(),
    ).toBeVisible();
    // Every text shown while the log was not there yet (an empty "screen time" may be true later).
    const seen = await page.evaluate(
      () => (globalThis as unknown as { seenTexts: string[] }).seenTexts,
    );
    expect(seen.filter((text) => EMPTY_COPY.test(text))).toEqual([]);
    await expect(page.getByRole("status").filter({ hasText: "Still syncing" })).toHaveCount(0, {
      timeout: 20_000,
    });
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
