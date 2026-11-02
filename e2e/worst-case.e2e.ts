import type { Page, TestInfo } from "@playwright/test";

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

type Known = {
  /** The finding that owns the break (context/design/findings.md). */
  readonly finding: string;
  /** What the overflowing element says (`<scrollWidth>><clientWidth>: <text>`). */
  readonly match: RegExp;
  /** Its break also makes the page or the gallery scroll sideways. */
  readonly scrolls?: true;
};

/**
The breaks that exist today, per set, element by element. An overflowing element that matches no
entry fails the case (a new break cannot hide behind an old one). An entry that matches nothing
in any size or language of its set fails the set: the task that fixes a finding deletes its
entries. Sideways scrolling of the page or the gallery is allowed only where an entry that says
`scrolls` matched. F-DAT-01: the submit label lists every solved subtask. F-DAT-02: text in a
flex row never shrinks (tags, labels, chips, long words and addresses). F-DAT-07: a text that
ellipsizes carries neither `data-text-policy="truncate"` nor its full value.
*/
const REALISTIC: readonly Known[] = [
  { finding: "F-DAT-02", match: /: (Домашка по алгебре 6|Algebra homework 6)$/u },
  { finding: "F-DAT-07", match: /: (Анна|Anna)$/u },
  { finding: "F-DAT-02", match: /: (Алгебра|Algebra)$/u },
  { finding: "F-DAT-02", match: /: (Это не я|Not me)/u },
];
const KNOWN: Readonly<Record<(typeof SETS)[number], readonly Known[]>> = {
  demo: REALISTIC,
  empty: [],
  one: REALISTIC,
  worst: [
    { finding: "F-DAT-01", match: /: (Сдать|Submit) 1, 2, 3/u },
    { finding: "F-DAT-02", match: /: \d+\. (Междисциплинарная|Interdisciplinary)/u, scrolls: true },
    { finding: "F-DAT-02", match: /: (Чтение предложений|Reading the committee)/u },
    { finding: "F-DAT-02", match: /: (Рабочий ноутбук|Work laptop)/u },
    { finding: "F-DAT-02", match: /: 2001:0db8/u },
    { finding: "F-DAT-02", match: /: https:\/\/example\.com\/storage/u },
    { finding: "F-DAT-02", match: /: (Это не я|Not me)/u },
    { finding: "F-DAT-07", match: /: 🍽️ Обед/u },
    { finding: "F-DAT-07", match: /: 🌿 Bartholomew/u },
  ],
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

/** Opens the gallery at one size and language, takes its picture and measures it. */
const open = async (
  page: Page,
  testInfo: TestInfo,
  at: { readonly set: string; readonly size: (typeof SIZES)[number]; readonly language: string },
): Promise<Overflow> => {
  const { language, set, size } = at;
  await page.setViewportSize({ height: size.height, width: size.width });
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
  return overflow;
};

/** What a measurement says against the set's known breaks: the entries it matched, and what is new. */
const judge = (
  known: readonly Known[],
  key: string,
  overflow: Overflow,
): { readonly matched: readonly Known[]; readonly unexpected: readonly string[] } => {
  const found = overflow.texts.map((text) => ({
    entry: known.find((candidate) => candidate.match.test(text)),
    text,
  }));
  const matched = found.flatMap(({ entry }) => (entry === undefined ? [] : [entry]));
  const isScrollExplained = matched.some((entry) => entry.scrolls === true);
  return {
    matched,
    unexpected: [
      ...found.filter(({ entry }) => entry === undefined).map(({ text }) => `${key} ${text}`),
      ...[`${key} scrolls sideways`].filter(
        () => (overflow.gallery || overflow.page) && !isScrollExplained,
      ),
    ],
  };
};

for (const set of SETS) {
  test(`${set}: every overflow is a known one, none is stale`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await loginViaApi(page);
    const known = KNOWN[set];
    const judged = [];
    for (const size of SIZES) {
      for (const language of LANGUAGES) {
        const key = `${set}/${String(size.width)}/${language}`;
        judged.push(judge(known, key, await open(page, testInfo, { language, set, size })));
      }
    }
    expect(judged.flatMap(({ unexpected }) => unexpected)).toEqual([]);
    const matched = new Set(judged.flatMap((one) => one.matched));
    expect(
      known
        .filter((entry) => !matched.has(entry))
        .map((entry) => `${entry.finding} ${entry.match}`),
      "stale entries: the break is fixed, delete them",
    ).toEqual([]);
  });
}

test("the gallery opens every set it names (and the URL says which)", async ({ page }) => {
  await loginViaApi(page);
  for (const set of SETS) {
    await page.goto(`/dev/gallery?set=${set}&lang=en&theme=dark`);
    await expect(page.getByTestId("worst-case-gallery")).toHaveAttribute("data-set", set);
  }
});
