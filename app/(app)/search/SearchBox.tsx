"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button, Input } from "@/components/ui";

export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("q");
    const term = typeof value === "string" ? value.trim() : "";
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        name="q"
        defaultValue={initial}
        placeholder="Search questions, answers, decks…"
        autoFocus={initial.length === 0}
        className="flex-1"
        aria-label="Search"
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
