import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("Account", "Your PlayFit Club account, sessions, and gym tools.");

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
