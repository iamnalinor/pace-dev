import { describe, expect, it } from "vitest";

import { fetchPreview, parsePreview } from "./link-preview.ts";

const html = (head: string): string =>
  `<!doctype html><html><head>${head}</head><body></body></html>`;

describe("parsePreview", () => {
  it("prefers og:title, decodes entities and resolves the icon", () => {
    expect(
      parsePreview(
        html(
          '<title>Fallback</title><meta property="og:title" content="Fix p99 &amp; retries"><link rel="icon" href="/static/fav.png">',
        ),
        "https://tracker.example.com/browse/TRK-231",
      ),
    ).toEqual({ icon: "https://tracker.example.com/static/fav.png", title: "Fix p99 & retries" });
  });

  it("falls back to <title> and /favicon.ico", () => {
    expect(
      parsePreview(html("<title>  Grafana —\n dashboards </title>"), "https://g.example.com/d/1"),
    ).toEqual({
      icon: "https://g.example.com/favicon.ico",
      title: "Grafana — dashboards",
    });
  });
});

describe("fetchPreview", () => {
  it("never throws: an unreachable page yields the host only", async () => {
    const preview = await fetchPreview("https://down.example.com/x", async () => {
      throw new Error("connection refused");
    });
    expect(preview).toEqual({
      host: "down.example.com",
      icon: null,
      title: null,
      url: "https://down.example.com/x",
    });
  });

  it("ignores non-HTML answers", async () => {
    const preview = await fetchPreview(
      "https://example.com/file.pdf",
      async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    );
    expect(preview.title).toBeNull();
  });

  it("reads the title of an HTML page", async () => {
    const preview = await fetchPreview(
      "https://example.com/",
      async () =>
        new Response(html("<title>Example Domain</title>"), {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
    );
    expect(preview.title).toBe("Example Domain");
  });
});
