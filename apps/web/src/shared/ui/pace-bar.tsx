import { cn } from "#web/shared/lib/cn.ts";

const clamp = (fraction: number): number => Math.min(Math.max(fraction, 0), 1);

export const percent = (fraction: number): string =>
  `${String(Math.round(clamp(fraction) * 100))}%`;

/**
A row's 3px progress bar with the lime pace marker: where the work should be by now.
Decorative — the meta line says the same in words.
*/
export const PaceBar = ({
  className,
  pace,
  value,
}: {
  /** 0..1 */
  readonly value: number;
  /** 0..1, or `null` when the task has no window to pace against. */
  readonly pace: null | number;
  readonly className?: string;
}) => (
  <div aria-hidden="true" className={cn("relative h-[3px] rounded-full bg-track", className)}>
    <div className="h-[3px] rounded-full bg-fg" style={{ width: percent(value) }} />
    {pace !== null && (
      <div
        className="absolute -top-[3px] h-[9px] w-0.5 rounded-full bg-accentText"
        data-testid="pace-marker"
        style={{ left: percent(pace) }}
      />
    )}
  </div>
);
