"use client";

import { useActionState } from "react";

import { Button, Card, Field, Input } from "@/components/ui";
import { switchProfile, type FormState } from "@/lib/actions/auth";

const initial: FormState = { error: null };

export function ProfileForm({ current, profiles }: { current: string; profiles: string[] }) {
  const [state, action, pending] = useActionState(switchProfile, initial);

  return (
    <Card className="max-w-md space-y-4">
      <p className="text-sm text-muted">
        Currently studying as <span className="font-medium text-ink">{current}</span>.
      </p>
      <form action={action} className="space-y-4">
        <Field label="Switch to" hint="A name that does not exist yet starts with a clean slate.">
          <Input name="profile" list="all-profiles" defaultValue={current} required maxLength={40} />
        </Field>
        <datalist id="all-profiles">
          {profiles.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {state.error ? (
          <p role="alert" className="rounded-xl border p-3 text-sm tint-danger text-danger">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Switching…" : "Switch profile"}
        </Button>
      </form>
    </Card>
  );
}
