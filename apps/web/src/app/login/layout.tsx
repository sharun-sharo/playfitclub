import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("Sign in", "Sign in to a PlayFit Club account.");

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
