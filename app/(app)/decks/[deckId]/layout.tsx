/**
 * Study surfaces (flashcards, Learn, Quiz and their results) stay at a reading
 * width even though the rest of the app widens on laptops: a flashcard or a
 * question stretched across a wide screen is harder to read, not easier.
 */
export default function DeckLayout({ children }: LayoutProps<"/decks/[deckId]">) {
  return <div className="mx-auto w-full max-w-5xl">{children}</div>;
}
