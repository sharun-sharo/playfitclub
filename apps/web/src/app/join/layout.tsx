import type { ReactNode } from "react";
import { fpDisplay, fpSans } from "@/components/marketing/fonts";

export default function JoinLayout({ children }: { children: ReactNode }) {
  return <div className={`${fpDisplay.variable} ${fpSans.variable} min-h-dvh overflow-x-hidden bg-[#07080d]`}>{children}</div>;
}
