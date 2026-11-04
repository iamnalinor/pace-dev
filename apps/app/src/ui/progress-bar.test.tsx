import { render, screen } from "@testing-library/react-native";

import { ProgressBar } from "./progress-bar.tsx";

describe("ProgressBar (spec §4.2.13)", () => {
  it("is a progress bar whose value is the percent the screen says, clamped to 0–100", async () => {
    await render(<ProgressBar label="Progress" value={1.4} />);
    const bar = screen.getByRole("progressbar", { name: "Progress" });
    expect(bar.props["aria-valuenow"]).toBe(100);
    expect(bar.props["aria-valuetext"]).toBe("100%");
  });

  it("says the value in the screen's own words when given", async () => {
    await render(<ProgressBar label="Progress" value={0.3} valueText="30 %" />);
    expect(screen.getByRole("progressbar").props["aria-valuetext"]).toBe("30 %");
  });

  it("draws a 4 high fill.4 pill track; the fill in the category's stroke or warn past the Expect", async () => {
    await render(
      <>
        <ProgressBar label="Running" tone={{ hue: "violet" }} value={0.5} />
        <ProgressBar label="Over" tone="warn" value={1} />
      </>,
    );
    const [running] = screen.getAllByRole("progressbar");
    expect(String(running?.props["className"]).split(" ")).toEqual(
      expect.arrayContaining(["h-1", "rounded-pill", "bg-fill-4"]),
    );
    const [violet, warn] = screen.getAllByTestId("progress-fill");
    expect(String(violet?.props["className"])).toContain("bg-hue-violet-stroke");
    expect(String(warn?.props["className"])).toContain("bg-warn");
  });
});
