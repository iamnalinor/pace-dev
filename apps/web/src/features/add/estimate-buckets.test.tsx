import { screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { renderWithProviders } from "#web/test/render.tsx";
import { defaultEstimateHints, type EstimateBucket } from "@pace/client";

import { EstimateBuckets } from "./estimate-buckets.tsx";

const Harness = ({ buckets }: { readonly buckets: readonly EstimateBucket[] }) => {
  const [value, setValue] = useState<null | number>(null);
  return (
    <>
      <EstimateBuckets buckets={buckets} onChange={setValue} value={value} />
      <output>{value ?? "none"}</output>
    </>
  );
};

describe("EstimateBuckets", () => {
  it("offers every bucket and no estimate when there are no hints yet", async () => {
    const { user } = renderWithProviders(
      <Harness buckets={defaultEstimateHints.bucketsFor("hw")} />,
    );
    const group = await screen.findByRole("radiogroup", { name: "Estimate" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual([
      "No estimate",
      "15m",
      "30m",
      "1h",
      "1h 30m",
      "2h",
      "3h",
      "5h",
      "8h",
    ]);
    expect(screen.getByRole("radio", { name: "No estimate" })).toBeChecked();
    expect(
      screen.getByText("No similar tasks yet: the hints fill in as you track time."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "1h 30m" }));
    expect(screen.getByRole("status")).toHaveTextContent("90");
    expect(screen.getByRole("radio", { name: "1h 30m" })).toBeChecked();
  });

  it("lists the samples under their bucket", async () => {
    renderWithProviders(
      <Harness
        buckets={[
          { minutes: 60, samples: [{ actualMinutes: 55, title: "Algebra HW 5" }] },
          { minutes: 120, samples: [] },
        ]}
      />,
    );
    const hour = await screen.findByRole("radio", { name: "1h" });
    expect(hour).toHaveAccessibleDescription("Algebra HW 5 · 55m");
    expect(screen.queryByText(/No similar tasks yet/)).not.toBeInTheDocument();
  });
});
