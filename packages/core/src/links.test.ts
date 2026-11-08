import * as fc from "fast-check";
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

  it("splits out a bare www. address too, opening it over https (feedback 5 item 8)", () => {
    expect(splitLinks("Docs at www.example.com/a, ok")).toEqual([
      { at: 0, kind: "text", text: "Docs at " },
      { at: 8, kind: "link", text: "www.example.com/a", url: "https://www.example.com/a" },
      { at: 25, kind: "text", text: ", ok" },
    ]);
    // Not inside a word, an address or an e-mail.
    for (const text of ["awww.example.com", "bob@www.example.com", "x.www.example.com"]) {
      expect(splitLinks(text).filter((part) => part.kind === "link")).toEqual([]);
    }
    expect(splitLinks("www.")).toEqual([{ at: 0, kind: "text", text: "www." }]);
  });

  it("never changes the text: the parts joined give it back, whatever it holds", () => {
    const piece = fc.constantFrom(
      "https://a.org/x?y=1",
      "www.b.com",
      "(",
      ")",
      ".",
      ", ",
      " ",
      "\n",
      "слово",
      "www.",
      "https://",
      "«",
      "»",
    );
    const pieces = fc.array(fc.oneof(piece, fc.string()));
    fc.assert(
      fc.property(pieces, (parts) => {
        const text = parts.join("");
        const split = splitLinks(text);
        expect(split.map((part) => part.text).join("")).toBe(text);
        expect(
          split.every((part) => text.slice(part.at, part.at + part.text.length) === part.text),
        ).toBe(true);
        expect(split.every((part) => part.kind === "text" || /^https?:\/\//u.test(part.url))).toBe(
          true,
        );
      }),
    );
  });

  it("finds every web address in a text, in order", () => {
    expect(allLinks("https://a.org and https://b.org/x.")).toEqual([
      "https://a.org",
      "https://b.org/x",
    ]);
    expect(allLinks(null)).toEqual([]);
  });
});
