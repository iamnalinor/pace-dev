import { joinList } from "./numbers.ts";

describe("joinList", () => {
  it("joins problem labels the way people say them", () => {
    expect(joinList([], "en")).toBe("");
    expect(joinList(["3"], "en")).toBe("3");
    expect(joinList(["3", "4"], "en")).toBe("3 and 4");
    expect(joinList(["5", "6", "7a"], "ru")).toBe("5, 6 и 7a");
  });
});
