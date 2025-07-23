

import type { ValidComponent } from "solid-js"
import { splitProps } from "solid-js"

import * as SeparatorPrimitive from "@kobalte/core/separator"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"

import { cn } from "@/lib/utils"

type SeparatorProps<T extends ValidComponent = "hr"> = SeparatorPrimitive.SeparatorRootProps<T> & {
  class?: string | undefined
}

const Separator = <T extends ValidComponent = "hr">(
  props: PolymorphicProps<T, SeparatorProps<T>>
) => {
  const [local, others] = splitProps(props as SeparatorProps, ["class"])
  return (
    <SeparatorPrimitive.Root
      data-slot="separator-root"
      class={cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        local.class
      )}
      {...others}
    />
  )
}

export { Separator }
