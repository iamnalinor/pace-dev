import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "#web/shared/lib/cn.ts";

/** The artboard toggle: 48×28 track, lime when on, a 22px knob. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-7 w-12 shrink-0 items-center rounded-full p-[3px] transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-raised",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-[22px] rounded-full ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-accentFg data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-fg2"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
