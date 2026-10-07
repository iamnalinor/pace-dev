import { useLanguage, useServices } from "#web/app-state.tsx";
import { formatZoned, type ZonedFormat } from "#web/shared/format/time.ts";

type Props = Pick<ZonedFormat, "at" | "deviceTz" | "mode" | "tz">;

/**
A time in the zone it was set in; when the viewer's zone has another offset, the zone's
name and the viewer's time follow (`23:59 MSK (your time 22:59)`).
*/
export const ZonedTime = ({ at, deviceTz, mode, tz }: Props) => {
  const language = useLanguage();
  const { now } = useServices().hooks.useClock();
  return <time dateTime={at}>{formatZoned({ at, deviceTz, language, mode, now, tz })}</time>;
};
