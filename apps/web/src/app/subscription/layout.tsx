import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("Subscription expired", "An expired subscription keeps your history and waits for the team to renew it.");

export default function SubscriptionLayout({ children }: { children: ReactNode }) {
  return children;
}
