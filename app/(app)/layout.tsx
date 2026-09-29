import { redirect } from "next/navigation";

import { Nav } from "@/components/Nav";
import { getSession } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <Nav profileName={session.profileName} isAdmin={session.role === "admin"} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">{children}</main>
      <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">
        Progress is saved for <span className="text-ink">{session.profileName}</span>.
      </footer>
    </>
  );
}
