/** An attendee as the phone's calendar reports it (Android gives the address, iOS the flag). */
export type CalendarAttendee = {
  readonly email?: string | undefined;
  readonly isCurrentUser?: boolean | undefined;
  readonly status: string;
};

export type EventPeople = {
  readonly attendees: readonly CalendarAttendee[];
  readonly organizerEmail: string | undefined;
  /** The account the calendar belongs to: the person's own address. */
  readonly ownerAccount: string | undefined;
};

const isSame = (a: string | undefined, b: string | undefined): boolean =>
  a?.trim().toLowerCase() === b?.trim().toLowerCase() && a !== undefined;

/**
Whether an event is the person's to attend: their own (no attendees, or organised by them), a
subscription, or an invitation they accepted. Declined, tentative and unanswered ones are not.
*/
export const isTakenEvent = ({ attendees, organizerEmail, ownerAccount }: EventPeople): boolean => {
  if (attendees.length === 0 || isSame(organizerEmail, ownerAccount)) {
    return true;
  }
  const self = attendees.find(
    (attendee) => attendee.isCurrentUser === true || isSame(attendee.email, ownerAccount),
  );
  return self === undefined || self.status === "accepted";
};
