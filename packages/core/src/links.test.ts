import { describe, expect, it } from "vitest";

import { allLinks, extractLink, isHttpUrl, linkHost, splitLinks } from "./links.ts";

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

  it("splits text into plain parts and the web addresses in it, each address whole", () => {
    expect(splitLinks("Slides: https://example.com/s, call https://meet.google.com/x.")).toEqual([
      { at: 0, kind: "text", text: "Slides: " },
      { at: 8, kind: "link", text: "https://example.com/s", url: "https://example.com/s" },
      { at: 29, kind: "text", text: ", call " },
      { at: 36, kind: "link", text: "https://meet.google.com/x", url: "https://meet.google.com/x" },
      { at: 61, kind: "text", text: "." },
    ]);
    expect(splitLinks("no link here")).toEqual([{ at: 0, kind: "text", text: "no link here" }]);
    expect(splitLinks("")).toEqual([]);
    // Every character survives the split, in order.
    const text = "a https://x.org b (https://y.org/p) c";
    expect(
      splitLinks(text)
        .map((part) => part.text)
        .join(""),
    ).toBe(text);
  });

  it("finds every web address in a text, in order", () => {
    expect(allLinks("https://a.org and https://b.org/x.")).toEqual([
      "https://a.org",
      "https://b.org/x",
    ]);
    expect(allLinks(null)).toEqual([]);
  });
});
