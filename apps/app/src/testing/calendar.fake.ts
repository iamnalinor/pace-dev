type FakeEvent = {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly allDay: boolean;
};

export type FakeCalendar = {
  readonly EntityTypes: { readonly EVENT: "event" };
  readonly getCalendarPermissions: () => Promise<{ status: string; canAskAgain: boolean }>;
  readonly requestCalendarPermissions: () => Promise<{ status: string; canAskAgain: boolean }>;
  readonly getCalendars: () => Promise<readonly { id: string; isVisible: boolean }[]>;
  readonly listEvents: (
    ids: readonly string[],
    from: Date,
    to: Date,
  ) => Promise<readonly FakeEvent[]>;
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
    getCalendars: async () => [{ id: "cal-1", isVisible: true }],
    listEvents: async (_ids, from, to) =>
      state.events.filter(
        (event) =>
          Date.parse(event.startDate) < to.getTime() && Date.parse(event.endDate) > from.getTime(),
      ),
    requestCalendarPermissions: async () => {
      state.status = state.grantOnRequest ? "granted" : "denied";
      state.canAskAgain = state.grantOnRequest;
      return { canAskAgain: state.canAskAgain, status: state.status };
    },
    state,
  };
};
