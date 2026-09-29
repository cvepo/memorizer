"use client";

import { useActionState } from "react";

import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { createCourse, type ActionState } from "@/lib/actions/content";

const initial: ActionState = { error: null };

export function CourseCreateForm() {
  const [state, action, pending] = useActionState(createCourse, initial);

  return (
    <Card className="max-w-lg space-y-4">
      <h2 className="font-medium">New course</h2>
      <form action={action} className="space-y-4">
        <Field label="Name">
          <Input name="name" required placeholder="BIOMI 2900" />
        </Field>
        <Field label="Description">
          <Textarea name="description" placeholder="Optional summary" />
        </Field>
        {state.error ? (
          <p role="alert" className="rounded-xl border p-3 text-sm tint-danger text-danger">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create course"}
        </Button>
      </form>
    </Card>
  );
}
