import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/** jsdom has no layout: Radix measures with ResizeObserver, sonner and Radix capture the pointer. */
class NoResizeObserver {
  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
}
vi.stubGlobal("ResizeObserver", NoResizeObserver);
Object.assign(Element.prototype, {
  hasPointerCapture: vi.fn(() => false),
  releasePointerCapture: vi.fn(),
  scrollIntoView: vi.fn(),
  setPointerCapture: vi.fn(),
});

afterEach(() => {
  cleanup();
});
