import { redirect } from "next/navigation";

/**
 * Flashcards now live on the deck page itself. This route is kept so existing
 * links and bookmarks still work, and forwards any `?q=` deep link along.
 */
export default async function FlashcardsPage({ params, searchParams }: PageProps<"/decks/[deckId]/flashcards">) {
  const { deckId } = await params;
  const { q } = await searchParams;
  const question = Array.isArray(q) ? q[0] : q;
  redirect(question ? `/decks/${deckId}?q=${encodeURIComponent(question)}` : `/decks/${deckId}`);
}
