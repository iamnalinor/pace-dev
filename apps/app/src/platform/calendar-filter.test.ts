import { isTakenEvent } from "./calendar-filter.ts";

const me = "me@example.com";

/** An invitation from the boss, answered with `status`. */
const invite = (status: string) => ({
  attendees: [
    { email: "boss@example.com", status: "accepted" },
    { email: me, status },
  ],
  organizerEmail: "boss@example.com",
  ownerAccount: me,
});

describe("which calendar events count", () => {
  it("keeps one's own events and subscriptions: no attendees, or organised by oneself", () => {
    expect(isTakenEvent({ attendees: [], organizerEmail: undefined, ownerAccount: me })).toBe(true);
    expect(
      isTakenEvent({
        attendees: [{ email: "a@example.com", status: "pending" }],
        organizerEmail: me,
        ownerAccount: me,
      }),
    ).toBe(true);
  });

  it("keeps an invitation only once it is accepted", () => {
    expect(isTakenEvent(invite("accepted"))).toBe(true);
    expect(isTakenEvent(invite("declined"))).toBe(false);
    expect(isTakenEvent(invite("tentative"))).toBe(false);
    expect(isTakenEvent(invite("pending"))).toBe(false);
    expect(isTakenEvent(invite("invited"))).toBe(false);
  });

  it("matches the person's address whatever its case, and on iOS by the current-user flag", () => {
    expect(
      isTakenEvent({
        attendees: [{ email: "ME@example.com", status: "declined" }],
        organizerEmail: "x@example.com",
        ownerAccount: me,
      }),
    ).toBe(false);
    expect(
      isTakenEvent({
        attendees: [{ isCurrentUser: true, status: "accepted" }],
        organizerEmail: "x@example.com",
        ownerAccount: undefined,
      }),
    ).toBe(true);
  });

  it("keeps an event whose attendees do not include the person (a shared calendar)", () => {
    expect(
      isTakenEvent({
        attendees: [{ email: "a@example.com", status: "accepted" }],
        organizerEmail: "a@example.com",
        ownerAccount: me,
      }),
    ).toBe(true);
  });
});
