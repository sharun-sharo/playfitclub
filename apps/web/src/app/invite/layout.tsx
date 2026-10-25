import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex(
  "Gym invitation",
  "Accept a gym invitation for an existing account. It does not create an account or start play by itself.",
);

export default function InviteLayout({ children }: { children: ReactNode }) {
  return children;
}
