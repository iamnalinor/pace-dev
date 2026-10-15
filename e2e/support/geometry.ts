import type { Page } from "@playwright/test";

import { expect } from "./fixtures.ts";

/** How far a child stuck out of its container in one frame, in px, on each side. */
type Frame = {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
};

/** The container a child is measured against: a CSS selector, or the nearest ancestor that clips. */
export const CLIPPING_ANCESTOR = ":clipping-ancestor";

type Watch = {
  /** CSS selectors, read anew each frame; `container` may be `CLIPPING_ANCESTOR`. */
  readonly child: string;
  readonly container: string;
  /** What sets the motion off (a click). */
  readonly during: () => Promise<void>;
  /** How long to keep sampling once both show. */
  readonly forMs?: number;
  /** The sides checked: a container that grows to reveal its child hides the child's foot. */
  readonly sides?: readonly (keyof Frame)[];
};

/** Records the frames until `forMs` after the two first show (5 s at most). */
const sampleFrames = async (
  page: Page,
  {
    child,
    container,
    forMs,
  }: { readonly child: string; readonly container: string; readonly forMs: number },
): Promise<readonly Frame[]> =>
  await page.evaluate(
    async ({ clipping, inner, outer, span }) =>
      await new Promise<readonly Frame[]>((resolve) => {
        const frames: Frame[] = [];
        const started = performance.now();
        const bounds = { end: Infinity };
        /** The container of `element`: by its selector, or its nearest clipping ancestor. */
        const boxOf = (element: Element): Element | null => {
          if (outer !== clipping) {
            return globalThis.document.querySelector(outer);
          }
          let box = element.parentElement;
          while (box !== null && globalThis.getComputedStyle(box).overflow !== "hidden") {
            box = box.parentElement;
          }
          return box;
        };
        const frame = (now: number): void => {
          const element = globalThis.document.querySelector(inner);
          const box = element === null ? null : boxOf(element);
          if (element !== null && box !== null) {
            bounds.end = Math.min(bounds.end, now + span);
            const a = element.getBoundingClientRect();
            const b = box.getBoundingClientRect();
            frames.push({
              bottom: a.bottom - b.bottom,
              left: b.left - a.left,
              right: a.right - b.right,
              top: b.top - a.top,
            });
          }
          if (now < bounds.end && now - started < 5000) {
            globalThis.requestAnimationFrame(frame);
          } else {
            resolve(frames);
          }
        };
        globalThis.requestAnimationFrame(frame);
      }),
    { clipping: CLIPPING_ANCESTOR, inner: child, outer: container, span: forMs },
  );

/**
Bug class 5 (layout and animation unit tests cannot see): samples, frame by frame while `during`
runs and settles, the box of the first element matching `child` against `container`, and fails
when the child sticks out of it by more than a pixel in any frame. Use it on anything that
animates size or position.
*/
export const expectStaysInside = async (
  page: Page,
  { child, container, during, forMs = 700, sides = ["top", "right", "bottom", "left"] }: Watch,
): Promise<void> => {
  const sampling = sampleFrames(page, { child, container, forMs });
  await during();
  const frames = await sampling;
  expect(frames.length, `${child} and ${container} on screen while it moved`).toBeGreaterThan(3);
  const escapes = frames.filter((frame) => sides.some((side) => frame[side] > 1));
  expect(escapes, `${child} inside ${container} in every frame`).toEqual([]);
};

/** The controls an overlay may cover: enabled buttons, fields, links, tabs, switches. */
const CONTROLS = [
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea",
  "a[href]",
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="radio"]',
  '[role="checkbox"]',
].join(", ");

/**
Bug class 6 (overlays placed without knowing what they cover): the names of the enabled controls
the element matching `overlay` lies over. Its own buttons do not count, nor the controls named
in `except` (the one a tooltip explains). An overlay over a control takes its tap.
*/
export const controlsUnder = async (
  page: Page,
  overlay: string,
  except: readonly string[] = [],
): Promise<readonly string[]> => {
  // Measured once it has settled (a toast slides in).
  await page.waitForFunction(() =>
    globalThis.document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  return await page.evaluate(
    ({ controls, exceptNames, selector }) => {
      const cover = globalThis.document.querySelector(selector);
      const box = cover?.getBoundingClientRect();
      if (cover === null || box === undefined) {
        return [`no ${selector} on screen`];
      }
      return [...globalThis.document.querySelectorAll(controls)]
        .filter((control) => !cover.contains(control))
        .filter((control) => control.closest('[aria-hidden="true"]') === null)
        .filter((control) => control.getAttribute("aria-disabled") !== "true")
        .filter((control) => {
          const rect = control.getBoundingClientRect();
          const isAcross = rect.left < box.right - 1 && rect.right > box.left + 1;
          const isAlong = rect.top < box.bottom - 1 && rect.bottom > box.top + 1;
          return rect.width > 0 && rect.height > 0 && isAcross && isAlong;
        })
        .map(
          (control) =>
            control.getAttribute("aria-label") ?? control.textContent.trim().slice(0, 40),
        )
        .filter((name) => !exceptNames.includes(name));
    },
    { controls: CONTROLS, exceptNames: [...except], selector: overlay },
  );
};
