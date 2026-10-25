import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("Choose a password", "Choose a password for an account the PlayFit Club team already created.");

export default function ActivateLayout({ children }: { children: ReactNode }) {
  return children;
}
