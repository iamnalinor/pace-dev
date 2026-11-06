import { ru } from "./support/catalog.ts";
import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";
import { seedLivedIn } from "./support/seed.ts";

test.describe("Insights at 390", () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test("no tile label is broken inside a word, and the bars share one value column (F-TYP-04, F-LAY-14)", async ({
    page,
  }) => {
    const { token } = await loginViaApi(page);
    await seedLivedIn(token);
    await page.goto("/insights");
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    // A word is split when a range over it spans two lines (its client rects sit at two heights).
    const split = await page.evaluate(() => {
      const found: string[] = [];
      const walker = globalThis.document.createTreeWalker(
        globalThis.document.body,
        4, // NodeFilter.SHOW_TEXT
      );
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node.parentElement?.closest('[role="group"]') === null) {
          continue;
        }
        const words = (node.textContent ?? "").matchAll(/\S+/gu);
        for (const word of words) {
          const range = globalThis.document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          const tops = new Set(
            Array.from(range.getClientRects(), (rect) => Math.round(rect.top / 4)),
          );
          if (tops.size > 1) {
            found.push(word[0]);
          }
        }
      }
      return found;
    });
    expect(split).toEqual([]);
    // Every bar of a chart ends where the others do: the value column has one left edge.
    const rights = await page
      .getByLabel(ru["insights.byCategory"], { exact: true })
      .getByTestId("insight-bar")
      .evaluateAll((bars) =>
        bars.map((bar) => Math.round(bar.parentElement?.getBoundingClientRect().right ?? 0)),
      );
    expect(new Set(rights).size).toBeLessThanOrEqual(1);
  });
});
