import {
  allLinks,
  type CalendarEvent,
  isHttpUrl,
  linkHost,
  splitLinks,
  startOfDayIn,
  type TextPart,
} from "@pace/core";

/** What the details of a calendar event show, each part `null` when the calendar did not tell it. */
export type EventDetails = {
  readonly title: string;
  readonly startAt: string;
  readonly endAt: string;
  /** Runs past midnight: the end names its own day. */
  readonly isMultiDay: boolean;
  readonly calendarName: null | string;
  /** The place, and a maps search for it. */
  readonly location: null | { readonly text: string; readonly mapsUrl: string };
  /** A video call to join, or else the event's own page. */
  readonly link: null | { readonly url: string; readonly isCall: boolean };
  /** The first lines of the notes as plain text, web addresses tappable. */
  readonly notes: null | { readonly parts: readonly TextPart[]; readonly isCut: boolean };
  readonly organizer: null | string;
  readonly attendeeCount: null | number;
};

/** How many lines of the notes the details show. */
const NOTES_LINES = 10;

/** The hosts of video calls: a link to one is offered as "Join the call". */
const CALL_HOSTS = [
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "teams.live.com",
  "telemost.yandex.ru",
  "webex.com",
  "whereby.com",
  "meet.jit.si",
  "discord.gg",
];

const isCallUrl = (url: string): boolean => {
  const host = linkHost(url);
  return CALL_HOSTS.some((call) => host === call || host.endsWith(`.${call}`));
};

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&gt;": ">",
  "&lt;": "<",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
};

/** The text without its tags, in one pass (a `<` that opens no tag stays). */
const withoutTags = (html: string): string =>
  html
    .split("<")
    .map((piece, index) => {
      const end = piece.indexOf(">");
      if (index === 0) {
        return piece;
      }
      return end === -1 ? `<${piece}` : piece.slice(end + 1);
    })
    .join("");

/** Notes as text: calendars (Google's above all) store them as HTML. */
const plainText = (notes: string): string =>
  withoutTags(notes.replaceAll(/<br ?\/?>|<\/(?:div|li|p)>/giu, "\n"))
    .replaceAll(/&(?:amp|gt|lt|nbsp|quot|#39);/gu, (entity) => ENTITIES[entity] ?? entity)
    .trim();

const notesOf = (notes = ""): EventDetails["notes"] => {
  const text = plainText(notes);
  if (text === "") {
    return null;
  }
  const lines = text.split("\n");
  return {
    isCut: lines.length > NOTES_LINES,
    parts: splitLinks(lines.slice(0, NOTES_LINES).join("\n")),
  };
};

/** The event's own web link, or else the first call link in its place or notes. */
const linkOf = (event: CalendarEvent): EventDetails["link"] => {
  const own = event.url?.trim() ?? "";
  if (isHttpUrl(own)) {
    return { isCall: isCallUrl(own), url: own };
  }
  const call = [...allLinks(event.location ?? null), ...allLinks(event.notes ?? null)].find((url) =>
    isCallUrl(url),
  );
  return call === undefined ? null : { isCall: true, url: call };
};

const locationOf = (location: string | undefined): EventDetails["location"] => {
  const text = location?.trim() ?? "";
  return text === ""
    ? null
    : {
        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`,
        text,
      };
};

/** An instant just before `at`: an event ending at midnight still belongs to the day before. */
const justBefore = (at: string): string => new Date(Date.parse(at) - 1).toISOString();

/** A calendar event's details for its pane (or sheet): what the phone's calendar told about it. */
export const eventDetails = (event: CalendarEvent, zone: string): EventDetails => ({
  attendeeCount: event.attendeeCount ?? null,
  calendarName: event.calendarName ?? null,
  endAt: event.endAt,
  isMultiDay:
    event.endAt > event.startAt &&
    startOfDayIn(event.startAt, zone) !== startOfDayIn(justBefore(event.endAt), zone),
  link: linkOf(event),
  location: locationOf(event.location),
  notes: notesOf(event.notes),
  organizer: event.organizer ?? null,
  startAt: event.startAt,
  title: event.title,
});
