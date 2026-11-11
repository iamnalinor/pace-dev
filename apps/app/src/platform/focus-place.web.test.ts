/**
@jest-environment jsdom
*/
import { focusedRowPlace, focusRowPlace } from "./focus-place.web.ts";

/** The check of row `index`. */
const checkbox = (index: number): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`#row-${String(index)}`);
  if (found === null) {
    throw new Error("no row");
  }
  return found;
};

/** A section as the lists draw it: its heading, its rows, then the next control on the page. */
const section = (rows: number) => {
  document.body.innerHTML = `
    <div role="heading">Today</div>
    <div role="list">
      ${Array.from({ length: rows }, (_, index) => `<div role="listitem"><div role="checkbox" tabindex="0" id="row-${String(index)}"></div></div>`).join("")}
    </div>
    <button id="after">Show done</button>`;
  return { checkbox };
};

/** Lets `count` animation frames draw. */
const frames = (count: number): void => {
  for (let index = 0; index < count; index += 1) {
    jest.advanceTimersByTime(17);
  }
};

describe("focus after a checked row leaves its list on the web (QA PR55-1-10, class 375)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    document.body.replaceChildren();
  });

  it("goes to the row that took its place", () => {
    const { checkbox } = section(2);
    checkbox(0).focus();
    const place = focusedRowPlace();
    focusRowPlace(place);
    checkbox(0).closest('[role="listitem"]')?.remove();
    frames(3);
    expect(document.activeElement).toBe(checkbox(1));
  });

  it("goes to the list heading's neighbour when the last row left, not to the page", () => {
    const { checkbox } = section(1);
    checkbox(0).focus();
    focusRowPlace(focusedRowPlace());
    checkbox(0).closest('[role="listitem"]')?.remove();
    frames(3);
    expect(document.activeElement).toBe(document.querySelector("#after"));
  });

  it("finds the heading's neighbour when the whole list went with its last row", () => {
    const { checkbox } = section(1);
    checkbox(0).focus();
    focusRowPlace(focusedRowPlace());
    document.querySelector('[role="list"]')?.remove();
    frames(3);
    expect(document.activeElement).toBe(document.querySelector("#after"));
  });

  it("waits for a row that takes a few frames to leave", () => {
    const { checkbox } = section(2);
    checkbox(0).focus();
    focusRowPlace(focusedRowPlace());
    frames(6);
    checkbox(0).closest('[role="listitem"]')?.remove();
    frames(3);
    expect(document.activeElement).toBe(checkbox(1));
  });

  it("leaves focus the person moved meanwhile", () => {
    const { checkbox } = section(2);
    checkbox(0).focus();
    focusRowPlace(focusedRowPlace());
    checkbox(1).focus();
    checkbox(0).closest('[role="listitem"]')?.remove();
    frames(6);
    expect(document.activeElement).toBe(checkbox(1));
  });
});
