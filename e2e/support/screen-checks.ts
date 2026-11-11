import type { Page, Request, Response } from "@playwright/test";

import { AxeBuilder } from "@axe-core/playwright";

import { waitForTransitions } from "./animation-wait.ts";
import { en, ru } from "./catalog.ts";
import { API_URL } from "./login.ts";

/**
The generic checks the route sweep runs on every screen (they used to be the scripted part of each
exploratory QA round, docs/qa.md): errors, failed requests, raw message keys, clipped text and a
network that goes quiet once the screen has settled.
*/

/** The catalog's namespaces (`now`, `settings`…): a raw key shows as one of them, a dot and more. */
const NAMESPACES = [...new Set(Object.keys(en).map((key) => key.split(".", 1)[0] ?? ""))];

/** What one request is, for telling a repeat: the method, the URL and the body. */
const requestKey = (request: Request): string => {
  const body = request.postData();
  return [request.method(), request.url(), ...(body === null ? [] : [body])].join(" ");
};

export type ScreenWatch = {
  /** Errors and failed or refused requests since the last `reset`. */
  readonly faults: () => readonly string[];
  /** Requests and socket frames sent since `at` (a `now()` reading). */
  readonly sentSince: (at: number) => readonly string[];
  readonly now: () => number;
  readonly reset: () => void;
  readonly stop: () => void;
};

/**
Watches the page from now on: thrown errors, `console.error` lines, requests to Pace's own servers
that fail or are answered 4xx/5xx (none is deliberate on a signed-in screen), and every request
and socket frame it sends (the keep-alive's pings left out), for the quiet window.
*/
export const watchScreen = (page: Page): ScreenWatch => {
  /** A request the page sent, when (ms since the watch began) and what it was. */
  type Sent = { readonly at: number; readonly key: string };
  const started = performance.now();
  const now = (): number => performance.now() - started;
  const faults: string[] = [];
  const sent: Sent[] = [];
  /** Pace's own servers: an outside one (Telegram's sign-in widget) is not judged here. */
  const isOwn = (url: string): boolean =>
    [new URL(API_URL).origin, new URL(page.url()).origin].includes(new URL(url).origin);
  const onError = (error: Error): void => {
    faults.push(`pageerror: ${error.message}`);
  };
  const onConsole = (message: { type: () => string; text: () => string }): void => {
    if (message.type() === "error") {
      faults.push(`console: ${message.text()}`);
    }
  };
  const onRequest = (request: Request): void => {
    sent.push({ at: now(), key: requestKey(request) });
  };
  const onFailed = (request: Request): void => {
    const reason = request.failure()?.errorText ?? "";
    // Cancelled by the page itself (it navigated on or let go of the request): not a failure.
    if (reason !== "net::ERR_ABORTED" && isOwn(request.url())) {
      faults.push(`failed: ${request.method()} ${request.url()} (${reason})`);
    }
  };
  const onResponse = (response: Response): void => {
    if (!(response.status() >= 400 && isOwn(response.url()))) {
      return;
    }

    const { pathname } = new URL(response.url());
    faults.push(`refused: ${response.request().method()} ${pathname} ${String(response.status())}`);
  };
  const onSocket = (socket: {
    on: (event: "framesent", listener: (frame: { payload: Buffer | string }) => void) => unknown;
    url: () => string;
  }): void => {
    socket.on("framesent", ({ payload }) => {
      const frame = String(payload);
      if (frame !== "ping") {
        sent.push({ at: now(), key: `WS ${socket.url()} ${frame}` });
      }
    });
  };
  page.on("pageerror", onError);
  page.on("console", onConsole);
  page.on("request", onRequest);
  page.on("requestfailed", onFailed);
  page.on("response", onResponse);
  page.on("websocket", onSocket);
  return {
    faults: () => [...faults],
    now,
    reset: () => {
      faults.length = 0;
      sent.length = 0;
    },
    sentSince: (at) => sent.filter((item) => item.at >= at).map((item) => item.key),
    stop: () => {
      page.off("pageerror", onError);
      page.off("console", onConsole);
      page.off("request", onRequest);
      page.off("requestfailed", onFailed);
      page.off("response", onResponse);
      page.off("websocket", onSocket);
    },
  };
};

/** The items that occur more than once. */
const repeatedItems = (items: readonly string[]): readonly string[] => [
  ...new Set(items.filter((item, index) => items.indexOf(item) !== index)),
];

/**
How long the network must stay quiet once a screen has settled: no request or socket frame sent
twice in it (QA round 15 H1, a read sent ~70 times a second; round 13 M2, a parse sent twice;
bug-lessons class 1).
*/
const QUIET_MS = 2000;

/**
The longest period of a loop the long window must catch: a retry with a backoff or a poll that
repeats every 3 to 5 s fits whole in the 2 s window without repeating (round 7 review).
*/
const LONGEST_LOOP_MS = 5000;

/**
The long window, once per screen (`route-sweep.e2e.ts`). A loop of period P sends twice in a window
W whatever its phase only when W ≥ 2P (review I4: a 6 s window caught a 5 s loop in one run of
five), so it is twice the longest period, plus a second of slack for the send itself.
*/
export const LONG_QUIET_MS = 2 * LONGEST_LOOP_MS + 1000;

/**
What went out more than once in the quiet window of `windowMs` that began at `settledAt`, once the
window has passed (waits for what is left of it).
*/
export const repeatsAfterSettle = async (
  watch: ScreenWatch,
  settledAt: number,
  windowMs = QUIET_MS,
): Promise<readonly string[]> => {
  const left = settledAt + windowMs - watch.now();
  if (left > 0) {
    // A window of time is what is measured here, not a condition to wait for.
    await new Promise((resolve) => {
      setTimeout(resolve, left);
    });
  }
  return repeatedItems(watch.sentSince(settledAt)).map((key) => `sent again: ${key.slice(0, 200)}`);
};

/** The first sync's cover, in either language: the screen under it is not drawn yet. */
const COVER = [en["sync.firstSync"], ru["sync.firstSync"]]
  .map((name) => `[role="progressbar"][aria-label="${name}"]`)
  .join(", ");

/**
Waits until the screen stops changing: the first sync's cover gone, no text or element added,
removed or changed for 400 ms (a clock ticking each minute does not keep it busy; styles that
animate are not counted), and some text on it. Answers a fault when it never does within 15 s (the
cover alone may stay 10 s).
*/
export const settle = async (page: Page): Promise<readonly string[]> => {
  try {
    await page.waitForFunction(
      async (cover) =>
        await new Promise<boolean>((resolve) => {
          const quiet: { timer?: ReturnType<typeof setTimeout> } = {};
          const done = (): void => {
            observer.disconnect();
            const body = globalThis.document.body;
            // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- what is drawn, not the covered app's text
            resolve(body.innerText.trim().length > 10 && body.querySelector(cover) === null);
          };
          const observer = new MutationObserver(() => {
            clearTimeout(quiet.timer);
            quiet.timer = setTimeout(done, 400);
          });
          observer.observe(globalThis.document, {
            characterData: true,
            childList: true,
            subtree: true,
          });
          quiet.timer = setTimeout(done, 400);
        }),
      COVER,
      { polling: 100, timeout: 15_000 },
    );
    return [];
  } catch {
    return ["never settles: the page keeps changing, stays empty or stays covered for 15 s"];
  }
};

/**
Message keys shown raw (a key missing from the catalog comes out as the key itself): in the text,
the accessible names, the placeholders and the tooltips' titles.
*/
export const rawKeys = async (page: Page): Promise<readonly string[]> => {
  const texts = await page.evaluate(() => [
    // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- what is drawn, not hidden text
    globalThis.document.body.innerText,
    ...[...globalThis.document.querySelectorAll("[aria-label], [placeholder], [title]")].flatMap(
      (element) =>
        ["aria-label", "placeholder", "title"].map(
          (attribute) => element.getAttribute(attribute) ?? "",
        ),
    ),
  ]);
  // eslint-disable-next-line security/detect-non-literal-regexp -- built from the catalog's own namespaces
  const pattern = new RegExp(
    String.raw`(?<![\w./:@~-])(?:${NAMESPACES.join("|")})\.[a-z][\w/-]*(?:\.[\w/-]+)*`,
    "gu",
  );
  return [
    ...new Set(
      texts.flatMap((text) =>
        text
          .matchAll(pattern)
          .map((match) => match[0])
          .toArray(),
      ),
    ),
  ];
};

/** One drawn text box, as measured in the page. */
type TextBox = {
  readonly label: string;
  /** Its content is wider than its box. */
  readonly isWider: boolean;
  /** It ends in an ellipsis or is clamped to lines (cut on purpose). */
  readonly isEllipsis: boolean;
  /** It scrolls sideways (what does not fit can be reached). */
  readonly scrolls: boolean;
  readonly width: number;
  /** It sticks out of the button or link it sits in. */
  readonly isOutsideControl: boolean;
  /** Words of letters drawn across two lines. */
  readonly brokenWords: readonly string[];
};

/** Measures every visible element with text of its own (inline pieces of a text are its parent's). */
const measureTextBoxes = async (page: Page): Promise<readonly TextBox[]> =>
  await page.evaluate(() => {
    // eslint-disable-next-line unicorn/consistent-function-scoping -- runs in the page (page.evaluate), where the module's scope is out of reach
    const ownText = (element: Element): string =>
      [...element.childNodes]
        .filter((node) => node.nodeType === node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
    const isShown = (element: Element): boolean => {
      const box = element.getBoundingClientRect();
      return (
        box.width > 0 &&
        box.height > 0 &&
        globalThis.getComputedStyle(element).display !== "inline" &&
        element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
        element.closest('[aria-hidden="true"]') === null
      );
    };
    const brokenWords = (element: Element): readonly string[] =>
      [...element.childNodes]
        .filter((node) => node.nodeType === node.TEXT_NODE)
        .flatMap((node) =>
          (node.textContent ?? "")
            .matchAll(/\p{L}{2,}/gu)
            .filter((word) => {
              const range = globalThis.document.createRange();
              range.setStart(node, word.index);
              range.setEnd(node, word.index + word[0].length);
              const lines = new Set(
                Array.from(range.getClientRects(), (rect) => Math.round(rect.top)),
              );
              return lines.size > 1;
            })
            .map((word) => word[0])
            .toArray(),
        );
    // eslint-disable-next-line unicorn/consistent-function-scoping -- runs in the page (page.evaluate), where the module's scope is out of reach
    const isOutsideControl = (element: Element): boolean => {
      // A count badge hangs off its icon's corner by design (`BadgeAnchor`, F-DAT-10).
      if (element.closest("[data-pace-hangs]") !== null) {
        return false;
      }
      const control = element.parentElement?.closest('button, [role="button"], a, [role="link"]');
      const frame = control?.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      return frame !== undefined && (box.right > frame.right + 1 || box.left < frame.left - 1);
    };
    return [...globalThis.document.body.querySelectorAll("*")]
      .filter((element) => ownText(element) !== "" && isShown(element))
      .map((element) => {
        const style = globalThis.getComputedStyle(element);
        const isEllipsis =
          style.textOverflow === "ellipsis" ||
          style.getPropertyValue("-webkit-line-clamp") !== "none";
        return {
          brokenWords: isEllipsis ? [] : brokenWords(element),
          isEllipsis,
          isWider: element.scrollWidth > element.clientWidth + 1,
          label: ownText(element).slice(0, 60),
          isOutsideControl: isOutsideControl(element),
          scrolls: ["auto", "scroll"].includes(style.overflowX),
          width: element.clientWidth,
        };
      });
  });

/** What is wrong with one text box. */
const textBoxFaults = (box: TextBox): readonly string[] => [
  ...(box.isWider && !box.isEllipsis && !box.scrolls
    ? [`"${box.label}" is wider than its box`]
    : []),
  ...(box.isWider && box.isEllipsis && box.width < 40
    ? [`"${box.label}" is cut to ${String(box.width)} px with an ellipsis`]
    : []),
  ...(box.isOutsideControl ? [`"${box.label}" leaves its button`] : []),
  ...box.brokenWords.map((word) => `"${word}" is broken across lines in "${box.label}"`),
];

/**
Text that does not fit where it is drawn (QA round 11 M5, a confirm label spilling out of its
button in Russian at 390 px; round 17 M6, the sidebar's name cut to "D…"; round 10, a word broken
mid-way): a text box whose content is wider than it and neither scrolls nor ends in an ellipsis; a
label that leaves its button; an ellipsis left with almost nothing; a word of letters split across
two lines; and a page that scrolls sideways.
*/
export const clippedText = async (page: Page): Promise<readonly string[]> => {
  const pageWidth = await page.evaluate(() => ({
    content: globalThis.document.documentElement.scrollWidth,
    window: globalThis.innerWidth,
  }));
  const boxes = await measureTextBoxes(page);
  return [
    ...new Set([
      ...(pageWidth.content > pageWidth.window + 1
        ? [`the page scrolls sideways (${String(pageWidth.content)} px wide)`]
        : []),
      ...boxes.flatMap((box) => textBoxFaults(box)),
    ]),
  ];
};

/** The WCAG 2.2 AA rule sets the e2e scans hold every page to (as `expectNoA11yViolations`). */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
Axe's serious and critical findings on the page, one line each. `isColourOnly` runs the colour
rules alone: a theme changes colours and nothing else, so the second theme of a screen already
scanned in full needs only those.
*/
export const axeFaults = async (
  page: Page,
  { isColourOnly }: { readonly isColourOnly: boolean },
): Promise<readonly string[]> => {
  // What the person sees once things settle, not a toast halfway through fading in.
  await waitForTransitions(page);
  const builder = new AxeBuilder({ page });
  const results = await (isColourOnly
    ? builder.withRules(["color-contrast", "link-in-text-block"])
    : builder.withTags(WCAG_TAGS)
  ).analyze();
  return results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map(
      (violation) =>
        `axe ${violation.id}: ${violation.nodes
          .map((node) => node.target.join(" "))
          .join(", ")
          .slice(0, 300)}`,
    );
};
