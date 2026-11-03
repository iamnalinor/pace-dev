import type { Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

/** How many local changes the page's copy still holds for the server (the IndexedDB outbox). */
const outboxSize = async (page: Page): Promise<number> =>
  await page.evaluate(
    async () =>
      await new Promise<number>((resolve, reject) => {
        const opened = globalThis.indexedDB.open("pace");
        opened.addEventListener("error", () => {
          reject(new Error("no local copy"));
        });
        opened.addEventListener("success", () => {
          const count = opened.result
            .transaction("pending", "readonly")
            .objectStore("pending")
            .count();
          count.addEventListener("success", () => {
            resolve(count.result);
            opened.result.close();
          });
        });
      }),
  );

/**
Waits until the start's own writes (a new account's time zone) have reached the server: Log out
reads the outbox at the press (re-review N2), so a test that counts its own changes starts empty.
*/
export const outboxSent = async (page: Page): Promise<void> => {
  await expect.poll(async () => await outboxSize(page), { timeout: 15_000 }).toBe(0);
};
