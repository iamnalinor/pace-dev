import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";
import { repeated } from "./support/sync-traffic.ts";

/**
Every read the page sends, over either channel: `GET /api/…?…` for HTTP, `pull since=N` for a pull
over the socket (the request id left out: two pulls of one cursor are the same read).
*/
const recordReads = (page: Page): { readonly reads: string[] } => {
  const reads: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    // The socket's upgrade is no read; a pull over HTTP reads like one over the socket.
    if (
      request.method() !== "GET" ||
      !url.pathname.startsWith("/api/") ||
      url.pathname === "/api/sync/live"
    ) {
      return;
    }
    const since = url.searchParams.get("since");
    reads.push(
      url.pathname === "/api/sync/pull"
        ? `pull since=${since ?? ""}`
        : `GET ${url.pathname}${url.search}`,
    );
  });
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      const frame = String(payload);
      if (!frame.startsWith("{")) {
        return;
      }
      const message = JSON.parse(frame) as { readonly type?: string; readonly since?: number };
      if (message.type === "pull") {
        reads.push(`pull since=${String(message.since)}`);
      }
    });
  });
  return { reads };
};

/** A window of time is what is measured here: everything the load and its settling send. */
const during = async (ms: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

for (const route of ["/", "/notifications"]) {
  test(`a full load of ${route} reads nothing twice: the server, the log, the pool (QA PR55-1-12)`, async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
    const { reads } = recordReads(page);
    await page.goto(route);
    await expect(page.getByRole("navigation").first()).toBeVisible();
    // The start, the socket's connection and its hello, the screen's own reads: all settled.
    await during(4000);
    expect(reads.filter((read) => read.startsWith("GET /api/instance"))).toHaveLength(1);
    expect(reads.filter((read) => read.startsWith("GET /api/notifications"))).toHaveLength(1);
    expect(repeated(reads)).toEqual([]);
  });
}

test("back online, the log is read once, not over HTTP and the new socket both (QA PR55-1-12)", async ({
  page,
}) => {
  const { token } = await loginViaApi(page);
  await seedLivedIn(token);
  const { reads } = recordReads(page);
  await page.goto("/");
  await expect(page.getByRole("navigation").first()).toBeVisible();
  await during(3000);
  await page.context().setOffline(true);
  await during(1500);
  reads.length = 0;
  await page.context().setOffline(false);
  await during(4000);
  expect(reads.filter((read) => read.startsWith("pull "))).toHaveLength(1);
  expect(repeated(reads)).toEqual([]);
});
