import { eyebrowDate } from "./date.ts";

describe("eyebrowDate", () => {
  it("names the weekday and the day on the zone's calendar", () => {
    expect(eyebrowDate("2026-10-06T12:00:00.000Z", "Europe/Moscow", "en")).toBe("Tue · Oct 6");
    expect(eyebrowDate("2026-10-06T22:30:00.000Z", "Europe/Moscow", "en")).toBe("Wed · Oct 7");
    expect(eyebrowDate("2026-10-06T12:00:00.000Z", "Europe/Moscow", "ru")).toBe("вт · 6 окт.");
  });
});
