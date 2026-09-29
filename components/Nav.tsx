"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Badge, cn } from "@/components/ui";
import { signOut } from "@/lib/actions/auth";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/courses", label: "Courses" },
  { href: "/decks", label: "Decks" },
  { href: "/search", label: "Search" },
  { href: "/import", label: "Import" },
];

export function Nav({ profileName, isAdmin }: { profileName: string; isAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const links = LINKS.filter((link) => link.href !== "/import" || isAdmin);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Memorizer
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                isActive(link.href) ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface hover:text-ink",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/profile" className="text-sm text-muted hover:text-ink" title="Switch profile">
              {profileName}
            </Link>
            {isAdmin ? <Badge tone="accent">Admin</Badge> : null}
            <form action={signOut}>
              <button type="submit" className="text-sm text-muted hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink sm:hidden"
          >
            <span aria-hidden>{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line bg-surface px-4 py-3 sm:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2.5 text-sm",
                  isActive(link.href) ? "bg-accent text-accent-fg" : "text-ink",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <Link href="/profile" className="text-sm text-muted">
              {profileName}
              {isAdmin ? " · Admin" : ""}
            </Link>
            <form action={signOut}>
              <button type="submit" className="text-sm text-muted">
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </header>
  );
}
