import { Slider as SliderPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "#web/shared/lib/cn.ts";

/**
The artboard progress slider: a 4px track, a filled range and a 22px knob ringed by the
page background. `marker` (0..1) draws the lime pace tick behind the knob.
*/
function Slider({
  className,
  marker,
  thumbLabel,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  readonly marker?: null | number;
  /** The accessible name of the knob (Radix puts the role `slider` on it). */
  readonly thumbLabel: string;
}) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex h-7 w-full touch-none items-center select-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-full bg-track"
      >
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-fg" />
      </SliderPrimitive.Track>
      {marker !== undefined && marker !== null && (
        <span
          aria-hidden="true"
          className="absolute top-1 h-5 w-0.5 rounded-full bg-accentText"
          style={{ left: `${String(Math.round(marker * 100))}%` }}
        />
      )}
      <SliderPrimitive.Thumb
        aria-label={thumbLabel}
        data-slot="slider-thumb"
        className="block size-[22px] shrink-0 rounded-full bg-fg shadow-[0_0_0_4px_var(--color-bg)] transition-[box-shadow] outline-none focus-visible:shadow-[0_0_0_4px_var(--color-bg),0_0_0_7px_var(--color-accent)]"
      />
    </SliderPrimitive.Root>
  );
}

export { Slider };
