import { redirect } from "next/navigation";

/** No public landing page in v1 — the root simply leads to the admin panel. */
export default function HomePage() {
  redirect("/admin");
}
