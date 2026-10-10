type FakeEvent = {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly allDay: boolean;
  readonly calendarId?: string;
  readonly recurrenceRule?: null | { readonly frequency: string };
  readonly organizerEmail?: string;
  /** The invitation's people; `undefined` for one's own event. */
  readonly attendees?: readonly { readonly email: string; readonly status: string }[];
};

/** An event as `listEvents` hands it out: with its calendar and a way to read its people. */
type ListedFakeEvent = FakeEvent & {
  readonly calendarId: string;
  readonly getAttendees: () => Promise<NonNullable<FakeEvent["attendees"]>>;
};

/** The address the fake calendar belongs to. */
export const FAKE_OWNER = "me@example.com";

export type FakeCalendar = {
  readonly EntityTypes: { readonly EVENT: "event" };
  readonly getCalendarPermissions: () => Promise<{ status: string; canAskAgain: boolean }>;
  readonly requestCalendarPermissions: () => Promise<{ status: string; canAskAgain: boolean }>;
  readonly getCalendars: () => Promise<
    readonly { id: string; isVisible: boolean; ownerAccount: string }[]
  >;
  readonly listEvents: (
    ids: readonly string[],
    from: Date,
    to: Date,
  ) => Promise<readonly ListedFakeEvent[]>;
  /** Test controls: the permission the phone answers with, and the events in its calendar. */
  readonly state: {
    status: string;
    canAskAgain: boolean;
    grantOnRequest: boolean;
    events: FakeEvent[];
  };
};

/** In-memory stand-in for `expo-calendar`: no access until a test grants it. */
export const createFakeCalendar = (): FakeCalendar => {
  const state: FakeCalendar["state"] = {
    canAskAgain: true,
    events: [],
    grantOnRequest: true,
    status: "undetermined",
  };
  return {
    EntityTypes: { EVENT: "event" },
    getCalendarPermissions: async () => ({
      canAskAgain: state.canAskAgain,
      status: state.status,
    }),
    getCalendars: async () => [{ id: "cal-1", isVisible: true, ownerAccount: FAKE_OWNER }],
    listEvents: async (_ids, from, to) =>
      state.events
        .filter(
          (event) =>
            Date.parse(event.startDate) < to.getTime() &&
            Date.parse(event.endDate) > from.getTime(),
        )
        .map((event) => ({
          calendarId: "cal-1",
          ...event,
          getAttendees: async () => event.attendees ?? [],
        })),
    requestCalendarPermissions: async () => {
      state.status = state.grantOnRequest ? "granted" : "denied";
      state.canAskAgain = state.grantOnRequest;
      return { canAskAgain: state.canAskAgain, status: state.status };
    },
    state,
  };
};
