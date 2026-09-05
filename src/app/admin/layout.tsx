import type { ReactNode } from "react";
import { ToastProvider } from "@/components/toast";

/** Wraps every admin page (including login) with the toast system. */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
