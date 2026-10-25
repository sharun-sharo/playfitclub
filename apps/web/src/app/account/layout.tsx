import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("New password", "Set a new password for your PlayFit Club account.");

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
