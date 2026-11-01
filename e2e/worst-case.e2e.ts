import type { Page } from "@playwright/test";

import { expect, test } from "./support/fixtures.ts";
import { loginViaApi } from "./support/login.ts";

/**
The overflow sweep (bug-lessons class "text from data in a flex row without a shrink rule").
Every worst-case set of the dev gallery (`/dev/gallery`, built only with EXPO_PUBLIC_DEV_LOGIN=1)
is opened at a phone, a narrow phone and a desktop width, in Russian and in English. The page
must not scroll sideways, and no text may be wider than its own box unless it says so with
`data-text-policy="truncate"` and a `title` that carries the full value (spec 4.1.2).
*/

const SETS = ["demo", "worst", "empty", "one"] as const;
const LANGUAGES = ["ru", "en"] as const;
const SIZES = [
  { height: 844, width: 390 },
  { height: 568, width: 320 },
  { height: 900, width: 1440 },
] as const;

/** The tallest picture of the gallery that is worth taking (a phone page is a long column). */
const MAX_SHOT_HEIGHT = 12_000;

/**
Sets that break today at every size and in both languages, with the findings that own the breaks
(context/design/findings.md). Each case is marked `test.fail()`: it must keep failing until the
task named here fixes it, and its marker is removed in that task's commit.
- F-DAT-02: text in a flex row never shrinks (the running activity's tag, project tags, week block
  labels, chips): fixed by the kit's `Text` yield rule (Tasks 3.9, 4.1, 4.5).
- F-DAT-01: the submit label lists every solved subtask (worst only; Task 4.5).
- F-DAT-07: a text that ellipsizes carries neither `data-text-policy="truncate"` nor its full
  value (the sidebar header's owner name, even a short one, is cut at 22 px).
`empty` has no data to break and stays a plain pass.
*/
const KNOWN_BREAKS: Readonly<Partial<Record<(typeof SETS)[number], string>>> = {
  demo: "F-DAT-02 running tag squeezed; F-DAT-07 owner name cut without its full value",
  one: "F-DAT-02 running tag squeezed; F-DAT-07 owner name cut without its full value",
  worst:
    "F-DAT-01 submit label lists every solved subtask; F-DAT-02 tags, labels and chips never shrink; F-DAT-07 cut texts carry no full value",
};

type Overflow = {
  /** The page scrolls sideways. */
  readonly page: boolean;
  /** The gallery's own scroller scrolls sideways. */
  readonly gallery: boolean;
  /** Text wider than its box, with what it says. */
  readonly texts: readonly string[];
};

/**
Measures the open gallery: page and scroller width, then every box that holds text against its
content. A box is wider than itself when something in it sticks out (a long word, a tag that did
not shrink); only the innermost such box is reported. Scrollers (a chip strip, the week on a
phone) are meant to be wider than their box, and a text that ellipsizes on purpose says so with
`data-text-policy="truncate"` and a title (or an accessibility label) carrying the full value.
*/
const measure = async (page: Page): Promise<Overflow> =>
  await page.evaluate(() => {
    const { document, getComputedStyle, window } = globalThis;
    const root = document.querySelector<HTMLElement>('[data-testid="worst-case-gallery"]');
    const isDeclared = (element: HTMLElement): boolean =>
      element.dataset["textPolicy"] === "truncate" &&
      (element.title !== "" || (element.getAttribute("aria-label") ?? "") !== "");
    const isScroller = (element: HTMLElement): boolean =>
      ["auto", "scroll"].includes(getComputedStyle(element).overflowX);
    const wider = [...document.body.querySelectorAll<HTMLElement>("*")].filter(
      (element) =>
        element.textContent.trim() !== "" &&
        // Inline boxes have no width of their own (clientWidth 0): their block parent is measured.
        element.clientWidth > 0 &&
        !isScroller(element) &&
        !isDeclared(element) &&
        element.scrollWidth > element.clientWidth + 1,
    );
    const innermost = wider.filter((element) =>
      wider.every((other) => other === element || !element.contains(other)),
    );
    return {
      gallery: root !== null && root.scrollWidth > root.clientWidth + 1,
      page: document.documentElement.scrollWidth > window.innerWidth,
      texts: innermost.map(
        (element) =>
          `${String(element.scrollWidth)}>${String(element.clientWidth)}: ${element.textContent.trim().slice(0, 60)}`,
      ),
    };
  });

for (const set of SETS) {
  for (const size of SIZES) {
    for (const language of LANGUAGES) {
      const key = `${set}/${String(size.width)}/${language}`;

      test(`${key}: no text breaks its box and the page does not scroll sideways`, async ({
        page,
      }, testInfo) => {
        const finding = KNOWN_BREAKS[set];
        test.fail(finding !== undefined, finding ?? "");
        await page.setViewportSize({ height: size.height, width: size.width });
        await loginViaApi(page);
        await page.goto(`/dev/gallery?set=${set}&lang=${language}&theme=light`);
        await expect(page.getByTestId("worst-case-gallery")).toBeVisible();
        // The gallery is static: wait until fonts and the first layout have settled.
        await page.evaluate(async () => {
          await globalThis.document.fonts.ready;
        });
        const overflow = await measure(page);
        // The gallery scrolls inside the window: grow the window to its content for the picture.
        const contentHeight = await page.evaluate(() => {
          const root = globalThis.document.querySelector('[data-testid="worst-case-gallery"]');
          return root === null ? 0 : root.scrollHeight;
        });
        await page.setViewportSize({
          height: Math.min(Math.max(contentHeight + 200, size.height), MAX_SHOT_HEIGHT),
          width: size.width,
        });
        await testInfo.attach(`gallery-${set}-${String(size.width)}-${language}`, {
          body: await page.screenshot(),
          contentType: "image/png",
        });
        expect(overflow).toEqual({ gallery: false, page: false, texts: [] });
      });
    }
  }
}

test("the gallery opens every set it names (and the URL says which)", async ({ page }) => {
  await loginViaApi(page);
  for (const set of SETS) {
    await page.goto(`/dev/gallery?set=${set}&lang=en&theme=dark`);
    await expect(page.getByTestId("worst-case-gallery")).toHaveAttribute("data-set", set);
  }
});
