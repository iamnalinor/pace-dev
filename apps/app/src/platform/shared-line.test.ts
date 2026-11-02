import { sharedLine } from "./shared-line.ts";

describe("sharedLine", () => {
  it("joins the title, the text and the link of a share", () => {
    expect(sharedLine(["Article", "a look at this", "https://example.com/a"])).toBe(
      "Article a look at this https://example.com/a",
    );
  });

  it("drops a part another one already holds, and empty parts", () => {
    expect(
      sharedLine([
        "Article",
        "https://example.com/a a look at this",
        "https://example.com/a",
        undefined,
      ]),
    ).toBe("Article https://example.com/a a look at this");
    expect(sharedLine(["", null, "  ", "same", "same"])).toBe("same");
  });

  it("answers an empty line when nothing was shared", () => {
    expect(sharedLine([undefined, null, ""])).toBe("");
  });
});
