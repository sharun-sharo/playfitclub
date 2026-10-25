import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("Admin", "PlayFit Club control for the team. This area is not a public page.");

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
