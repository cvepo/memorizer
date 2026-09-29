"use client";

import { useActionState, useState, useTransition } from "react";

import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { deleteDeck, updateDeck, type ActionState } from "@/lib/actions/content";
import type { Deck } from "@/lib/types";

const initial: ActionState = { error: null };

export function DeckAdmin({ deck }: { deck: Deck }) {
  const [state, action, pending] = useActionState(updateDeck, initial);
  const [armed, setArmed] = useState(false);
  const [deleting, startDeleting] = useTransition();

  return (
    <Card className="space-y-5">
      <h2 className="font-medium">Deck settings</h2>

      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={deck.id} />
        <Field label="Deck name">
          <Input name="name" defaultValue={deck.name} required maxLength={120} />
        </Field>
        <Field label="Description" hint="Optional — shown under the deck name.">
          <Textarea name="description" defaultValue={deck.description ?? ""} />
        </Field>

        {state.error ? (
          <p role="alert" className="rounded-xl border p-3 text-sm tint-danger text-danger">
            {state.error}
          </p>
        ) : null}
        {state.ok && !state.error ? (
          <p className="text-sm text-success" role="status">
            Saved
          </p>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="border-t border-line pt-5">
        <Button
          variant="danger"
          disabled={deleting}
          onClick={() => {
            if (!armed) {
              setArmed(true);
              return;
            }
            startDeleting(async () => {
              await deleteDeck(deck.id);
            });
          }}
        >
          {deleting
            ? "Deleting…"
            : armed
              ? "Click again to delete — this removes every question"
              : "Delete deck"}
        </Button>
        {armed && !deleting ? (
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="ml-2 min-h-11 px-2 text-sm text-muted transition-colors duration-150 hover:text-ink"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </Card>
  );
}
