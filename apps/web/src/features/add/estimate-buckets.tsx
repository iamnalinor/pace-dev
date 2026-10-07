import { useId } from "react";

import type { EstimateBucket } from "@pace/client";

import { useLanguage } from "#web/app-state.tsx";
import { useT } from "#web/i18n.tsx";
import { formatMinutes } from "#web/shared/format/duration.ts";
import { cn } from "#web/shared/lib/cn.ts";

type Props = {
  readonly buckets: readonly EstimateBucket[];
  readonly value: null | number;
  readonly onChange: (minutes: null | number) => void;
};

const chipClass = (isChecked: boolean): string =>
  cn(
    "flex h-11 min-w-11 items-center justify-center rounded-md px-3 font-mono text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40",
    isChecked ? "bg-inverse text-inverseFg" : "bg-raised text-fg2",
  );

/**
The estimate as a choice of buckets. Under a bucket, the closed tasks of the same preset
that took about that long (the hints port; empty until the time ledger exists).
*/
export const EstimateBuckets = ({ buckets, onChange, value }: Props) => {
  const t = useT();
  const language = useLanguage();
  const id = useId();
  const withSamples = buckets.filter((bucket) => bucket.samples.length > 0);
  const options = [{ minutes: null, samples: [] }, ...buckets];
  return (
    <div className="grid gap-2">
      <div aria-label={t("add.estimate")} className="flex flex-wrap gap-1.5" role="radiogroup">
        {options.map((bucket) => (
          <button
            aria-checked={bucket.minutes === value}
            aria-describedby={
              bucket.samples.length > 0 ? `${id}-${String(bucket.minutes)}` : undefined
            }
            className={chipClass(bucket.minutes === value)}
            key={bucket.minutes ?? "none"}
            onClick={() => {
              onChange(bucket.minutes);
            }}
            role="radio"
            type="button"
          >
            {bucket.minutes === null
              ? t("add.noEstimate")
              : formatMinutes(bucket.minutes, language)}
          </button>
        ))}
      </div>
      {withSamples.length === 0 ? (
        <p className="text-xs text-faint">{t("add.hintsEmpty")}</p>
      ) : (
        <ul className="grid gap-1 text-xs text-muted">
          {withSamples.map((bucket) => (
            <li key={bucket.minutes}>
              <span aria-hidden="true" className="font-mono text-fg2">
                {formatMinutes(bucket.minutes, language)}:{" "}
              </span>
              <span id={`${id}-${String(bucket.minutes)}`}>
                {bucket.samples
                  .map(
                    (sample) =>
                      `${sample.title} · ${formatMinutes(sample.actualMinutes, language)}`,
                  )
                  .join("; ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
