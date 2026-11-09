import { boxLabelFit } from "./box-label.ts";

describe("boxLabelFit (design review H6: never a word broken inside itself)", () => {
  it("wraps a name whose words fit the box over the lines it holds", () => {
    expect(boxLabelFit("Пошёл в ЦСС", 80, 3)).toEqual({ lines: 3, policy: "clamp" });
  });

  it("cuts a name to one line with an ellipsis when a word cannot fit the box", () => {
    expect(boxLabelFit("Музыка", 44, 3)).toEqual({ policy: "truncate" });
    expect(boxLabelFit("Пошёл в ЦСС", 36, 3)).toEqual({ policy: "truncate" });
  });

  it("cuts a Cyrillic word that only just does not fit, rather than let it stick out (worst-case sweep)", () => {
    // «Домашка» is 58 px in a 56 px box.
    expect(boxLabelFit("Домашка по алгебре 6", 56, 3)).toEqual({ policy: "truncate" });
  });

  it("wraps until the box is measured", () => {
    expect(boxLabelFit("Музыка", 0, 2)).toEqual({ lines: 2, policy: "clamp" });
  });
});
