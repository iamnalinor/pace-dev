it("runs in a zone that is not UTC (bug-lessons class 135)", () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).not.toBe(0);
});
