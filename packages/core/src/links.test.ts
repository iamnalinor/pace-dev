import { describe, expect, it } from "vitest";

import { extractLink, isHttpUrl, linkHost } from "./links.ts";

describe("links", () => {
  it("finds the first web address and drops sentence punctuation", () => {
    expect(extractLink("синк по дашборду https://grafana.example.com/d/abc?x=1, до пятницы")).toBe(
      "https://grafana.example.com/d/abc?x=1",
    );
    expect(extractLink("see (https://example.com/a).")).toBe("https://example.com/a");
    expect(extractLink("no link here")).toBeNull();
    expect(extractLink(null)).toBeNull();
    expect(extractLink("ftp://example.com")).toBeNull();
  });

  it("accepts only http(s) URLs", () => {
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl("TRK-231")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("shows the bare host", () => {
    expect(linkHost("https://www.github.com/iamnalinor/pace-dev")).toBe("github.com");
  });
});
