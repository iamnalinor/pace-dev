import { middleEllipsis } from "./middle-ellipsis.ts";

describe("middleEllipsis", () => {
  it("leaves a short text whole", () => {
    expect(middleEllipsis("pace.example.dev", 28)).toBe("pace.example.dev");
  });

  it("keeps the start and the end of a long host", () => {
    const shown = middleEllipsis("pace.workstation-alexander.tail1234.ts.net:8443", 28);
    expect(shown).toHaveLength(28);
    expect(shown.startsWith("pace.workstat")).toBe(true);
    expect(shown.endsWith("ts.net:8443")).toBe(true);
    expect(shown).toContain("…");
  });
});
