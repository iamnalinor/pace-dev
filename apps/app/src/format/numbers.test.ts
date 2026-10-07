import { joinList, ordinal, percentText } from "./numbers.ts";

describe("ordinal", () => {
  it("adds the English suffix and the Russian ending", () => {
    expect([1, 2, 3, 4, 11, 22].map((n) => ordinal(n, "en"))).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "22nd",
    ]);
    expect(ordinal(2, "ru")).toBe("2-я");
  });
});

describe("joinList", () => {
  it("joins problem labels the way people say them", () => {
    expect(joinList([], "en")).toBe("");
    expect(joinList(["3"], "en")).toBe("3");
    expect(joinList(["3", "4"], "en")).toBe("3 and 4");
    expect(joinList(["5", "6", "7a"], "ru")).toBe("5, 6 и 7a");
  });
});

describe("percentText", () => {
  it("rounds a fraction to a whole percent", () => {
    expect(percentText(0.654)).toBe("65%");
  });
});
