"use client";

import { useActionState, useState } from "react";

import { Button, Card, Field, Input, cn } from "@/components/ui";
import { signIn, type FormState } from "@/lib/actions/auth";

const initial: FormState = { error: null };

type Mode = "study" | "admin";

export function LoginForm({ profiles, next }: { profiles: string[]; next: string }) {
  const [mode, setMode] = useState<Mode>("study");
  const [state, action, pending] = useActionState(signIn, initial);

  return (
    <Card className="space-y-5">
      <div
        className="grid grid-cols-2 gap-0.5 rounded-xl border border-line bg-sunken p-0.5"
        role="tablist"
        aria-label="Sign-in method"
      >
        {(["study", "admin"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "min-h-10 rounded-[10px] px-3 text-sm font-medium transition-colors",
              mode === value ? "bg-accent text-accent-fg" : "text-muted hover:text-ink",
            )}
          >
            {value === "study" ? "Study access" : "Admin"}
          </button>
        ))}
      </div>

      {/* Remounted per mode so the browser never carries a value between the
          two forms and `pending` state cannot leak across them. */}
      <form key={mode} action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={mode} />

        {mode === "admin" ? (
          <Field label="Email">
            <Input
              name="email"
              type="email"
              autoComplete="username"
              required
              autoFocus
              placeholder="you@example.com"
            />
          </Field>
        ) : null}

        <Field label="Password">
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus={mode === "study"}
            placeholder={mode === "admin" ? "Admin password" : "Shared password"}
          />
        </Field>

        <Field
          label={mode === "admin" ? "Your name (optional)" : "Your name"}
          hint="Used only to keep everyone's mastery separate."
        >
          <Input
            name="profile"
            list="known-profiles"
            required={mode === "study"}
            maxLength={40}
            autoComplete="nickname"
            placeholder="e.g. Enzo"
          />
        </Field>

        {profiles.length > 0 ? (
          <datalist id="known-profiles">
            {profiles.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        ) : null}

        {state.error ? (
          <p role="alert" className="rounded-xl border p-3 text-sm tint-danger text-danger">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Checking…" : mode === "admin" ? "Sign in as admin" : "Start studying"}
        </Button>
      </form>

      <p className="text-xs text-muted">
        {mode === "admin"
          ? "Admin can import spreadsheets and edit every deck."
          : "The shared password lets you study everything and saves your own progress. Importing and editing need the admin sign-in."}
      </p>
    </Card>
  );
}
