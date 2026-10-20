import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em]", {
  variants: {
    variant: {
      default: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
      violet: "border-violet-400/40 bg-violet-400/10 text-violet-200",
      muted: "border-border bg-secondary text-muted-foreground",
      danger: "border-rose-400/40 bg-rose-400/10 text-rose-200",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
