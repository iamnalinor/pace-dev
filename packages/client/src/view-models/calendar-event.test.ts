import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "@pace/core";

import { MOSCOW } from "@pace/core/testing";

import { eventDetails } from "./calendar-event.ts";

const base: CalendarEvent = {
  endAt: "2026-10-06T11:30:00.000Z",
  id: "ev-1",
  series: null,
  startAt: "2026-10-06T10:00:00.000Z",
  title: "Algebra",
};

describe("eventDetails", () => {
  it("leaves out what the calendar did not tell (an older phone's copy)", () => {
    expect(eventDetails(base, MOSCOW)).toEqual({
      attendeeCount: null,
      calendarName: null,
      endAt: base.endAt,
      isMultiDay: false,
      link: null,
      location: null,
      notes: null,
      organizer: null,
      startAt: base.startAt,
      title: "Algebra",
    });
  });

  it("gives the place a maps link, and the call link from the event or else from its place or notes", () => {
    const details = eventDetails(
      {
        ...base,
        attendeeCount: 12,
        calendarName: "University",
        location: "Room 214, Main building",
        notes: "Join: https://us02web.zoom.us/j/123?pwd=x. Slides at https://example.org/s",
        organizer: "Prof. Ivanova",
      },
      MOSCOW,
    );
    expect(details.location).toEqual({
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Room%20214%2C%20Main%20building",
      text: "Room 214, Main building",
    });
    expect(details.link).toEqual({ isCall: true, url: "https://us02web.zoom.us/j/123?pwd=x" });
    expect(details).toMatchObject({
      attendeeCount: 12,
      calendarName: "University",
      organizer: "Prof. Ivanova",
    });
    // The event's own link wins; a page that is no call is still a link to open.
    expect(eventDetails({ ...base, url: "https://example.org/agenda" }, MOSCOW).link).toEqual({
      isCall: false,
      url: "https://example.org/agenda",
    });
    expect(
      eventDetails({ ...base, location: "https://meet.google.com/abc-defg-hij" }, MOSCOW).link,
    ).toEqual({ isCall: true, url: "https://meet.google.com/abc-defg-hij" });
    // Something that is no web address is never offered to open.
    expect(eventDetails({ ...base, url: "javascript:alert(1)" }, MOSCOW).link).toBeNull();
  });

  it("shows the notes as plain text, the first ten lines, links tappable", () => {
    const lines = Array.from({ length: 14 }, (_, index) => `Line ${String(index + 1)}`);
    const long = eventDetails({ ...base, notes: lines.join("\n") }, MOSCOW).notes;
    expect(long?.isCut).toBe(true);
    expect(long?.parts.map((part) => part.text).join("")).toBe(lines.slice(0, 10).join("\n"));
    // Google's descriptions come as HTML: line breaks kept, tags and entities gone.
    const html = eventDetails(
      {
        ...base,
        notes: 'Agenda<br>1. Recap&nbsp;&amp; Q<br/><a href="https://example.org/doc">doc</a>',
      },
      MOSCOW,
    ).notes;
    expect(html).toEqual({
      isCut: false,
      parts: [{ at: 0, kind: "text", text: "Agenda\n1. Recap & Q\ndoc" }],
    });
    const linked = eventDetails({ ...base, notes: "See https://example.org/s" }, MOSCOW).notes;
    expect(linked?.parts).toEqual([
      { at: 0, kind: "text", text: "See " },
      { at: 4, kind: "link", text: "https://example.org/s", url: "https://example.org/s" },
    ]);
    expect(eventDetails({ ...base, notes: " <br> " }, MOSCOW).notes).toBeNull();
  });

  it("knows an event that runs past midnight, but not one that ends at it", () => {
    // Saturday 17:44 to Sunday 10:43 in Moscow: the train.
    const train = {
      ...base,
      endAt: "2026-10-18T07:43:00.000Z",
      startAt: "2026-10-17T14:44:00.000Z",
    };
    expect(eventDetails(train, MOSCOW).isMultiDay).toBe(true);
    const untilMidnight = {
      ...base,
      endAt: "2026-10-17T21:00:00.000Z",
      startAt: "2026-10-17T19:00:00.000Z",
    };
    expect(eventDetails(untilMidnight, MOSCOW).isMultiDay).toBe(false);
  });
});
