import { useLanguage } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { fillClass } from "#web/shared/ui/color-tag.tsx";
import {
  focusSleepRows,
  fragmentationTiles,
  HOUR_TICKS,
  hourLabel,
  type InsightsModel,
} from "@pace/client";
import { CATEGORY_COLORS } from "@pace/core";

/** Focus is drawn in the work color, sleep in the sleep category's, as on Day. */
const FOCUS_FILL = fillClass(CATEGORY_COLORS.work);
const SLEEP_FILL = fillClass(CATEGORY_COLORS.sleep);

const Card = ({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) => (
  <section aria-label={label} className="rounded-xl border border-line bg-surface p-4">
    <h2 className="mb-3 text-sm font-medium text-fg">{label}</h2>
    {children}
  </section>
);

/**
Focus minutes by hour of day: one series, so no legend; 24 thin columns from a zero baseline,
the busiest hour named in text, every value in a table for screen readers.
*/
export const HoursChart = ({ hours }: { readonly hours: InsightsModel["hours"] }) => {
  const t = useT();
  const language = useLanguage();
  const most = Math.max(1, ...hours.minutes);
  return (
    <Card label={t("insights.hours")}>
      {hours.peak === null ? null : (
        <p className="mb-3 text-xs text-fg2">
          {t("insights.hoursPeak", { from: hourLabel(hours.peak), to: hourLabel(hours.peak + 1) })}
        </p>
      )}
      <div aria-hidden="true" className="flex h-24 items-end gap-0.5 border-b border-line">
        {hours.minutes.map((minutes, hour) => (
          <span
            className="flex h-full flex-1 items-end"
            key={hourLabel(hour)}
            title={t("insights.hourValue", {
              duration: formatMinutes(minutes, language),
              hour: hourLabel(hour),
            })}
          >
            {minutes > 0 ? (
              <span
                className={`block w-full rounded-t ${FOCUS_FILL}`}
                style={{ height: `${String(Math.max(3, Math.round((minutes / most) * 100)))}%` }}
              />
            ) : null}
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 grid grid-cols-4 font-mono text-[11px] text-muted">
        {HOUR_TICKS.map((hour) => (
          <span key={hour}>{hourLabel(hour)}</span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{t("insights.hoursTable")}</caption>
        <tbody>
          {hours.minutes.map((minutes, hour) => (
            <tr key={hourLabel(hour)}>
              <th scope="row">{hourLabel(hour)}</th>
              <td>{formatMinutes(minutes, language)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

/** Three headline numbers: how long focus lasted, how often it broke, how often the activity changed. */
export const FragmentationCard = ({
  fragmentation,
}: {
  readonly fragmentation: InsightsModel["fragmentation"];
}) => {
  const t = useT();
  const tiles = fragmentationTiles(fragmentation, useLanguage());
  return tiles === null ? null : (
    <Card label={t("insights.fragmentation")}>
      <dl className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div className="rounded-lg bg-raised p-3" key={tile.key}>
            <dt className="text-xs text-fg2">{t(tile.key)}</dt>
            <dd className="mt-1 font-mono text-lg text-fg">{tile.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
};

const Bar = ({ fill, share }: { readonly fill: string; readonly share: number }) => (
  <span className="h-2 overflow-hidden rounded-r bg-track">
    {share > 0 ? (
      <span
        className={`block h-full rounded-r ${fill}`}
        style={{ width: `${String(Math.max(2, Math.round(share * 100)))}%` }}
      />
    ) : null}
  </span>
);

/**
Each day: the night before and the day's focus. Two measures of different size, so two bar
columns, each on its own scale (never one shared axis), the values always written out.
*/
export const FocusSleepCard = ({
  days,
  zone,
}: {
  readonly days: InsightsModel["focusSleep"];
  readonly zone: string;
}) => {
  const t = useT();
  const rows = focusSleepRows(days, { language: useLanguage(), zone });
  return rows === null ? null : (
    <Card label={t("insights.focusSleep")}>
      <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-x-3 gap-y-2 text-xs">
        <span />
        <span className="text-fg2">{t("insights.sleepBefore")}</span>
        <span className="text-fg2">{t("insights.focus")}</span>
        {rows.map((row) => (
          <div className="contents" key={row.date}>
            <span className="text-fg2">{row.weekday}</span>
            <span className="grid gap-1">
              <Bar fill={SLEEP_FILL} share={row.sleepShare} />
              <span className="font-mono text-fg">{row.sleepText ?? t("insights.notLogged")}</span>
            </span>
            <span className="grid gap-1">
              <Bar fill={FOCUS_FILL} share={row.focusShare} />
              <span className="font-mono text-fg">{row.focusText}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};
