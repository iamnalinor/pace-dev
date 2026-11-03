import { act, render, screen } from "@testing-library/react-native";

import { Skeleton } from "./skeleton.tsx";
import { SKELETON_DELAY_MS } from "./use-shown-after.ts";

const barsOpacity = (): unknown => {
  const style = screen.getByTestId("skeleton-bars").props["style"] as { readonly opacity: number };
  return style.opacity;
};

describe("Skeleton (spec §4.2.23)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("is one progress bar named once, holding its place from the first frame", async () => {
    await render(<Skeleton label="Loading devices…" rows={2} />);
    const region = screen.getByRole("progressbar", { name: "Loading devices…" });
    expect(region.props["aria-busy"]).toBe(true);
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("shows its bars only after 300 ms of waiting, so a fast load shows nothing", async () => {
    await render(<Skeleton label="Loading" />);
    expect(barsOpacity()).toBe(0);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(SKELETON_DELAY_MS);
    });
    expect(barsOpacity()).toBe(1);
  });

  it("draws its bars in label.quaternary (the 1.5:1 guard of contrast.test.ts), never fill.3", async () => {
    await render(<Skeleton label="Loading" rows={1} shape="listRow" />);
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain("bg-label-quaternary");
    expect(json).not.toContain("bg-fill-3");
  });
});
