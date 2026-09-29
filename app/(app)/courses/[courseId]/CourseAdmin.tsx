"use client";

import { useActionState, useState, useTransition } from "react";

import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { createDeck, deleteCourse, updateCourse, type ActionState } from "@/lib/actions/content";
import type { Course } from "@/lib/types";

const initial: ActionState = { error: null };

export function CourseAdmin({ course }: { course: Course }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AddDeckForm courseId={course.id} />
      <CourseSettingsForm course={course} />
    </div>
  );
}

function AddDeckForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState(createDeck, initial);

  return (
    <Card className="space-y-4">
      <h2 className="font-medium">Add a deck</h2>
      <form action={action} className="space-y-4">
        <input type="hidden" name="course_id" value={courseId} />
        <Field label="Name">
          <Input name="name" required placeholder="Prelim 1 Review" />
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
          {pending ? "Adding…" : "Add deck"}
        </Button>
      </form>
    </Card>
  );
}

function CourseSettingsForm({ course }: { course: Course }) {
  const [state, action, pending] = useActionState(updateCourse, initial);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, startTransition] = useTransition();

  return (
    <Card className="space-y-4">
      <h2 className="font-medium">Course settings</h2>
      <form action={action} className="space-y-4">
        <input type="hidden" name="id" value={course.id} />
        <Field label="Name">
          <Input name="name" required defaultValue={course.name} />
        </Field>
        <Field label="Description">
          <Textarea name="description" defaultValue={course.description ?? ""} />
        </Field>
        {state.error ? (
          <p role="alert" className="rounded-xl border p-3 text-sm tint-danger text-danger">
            {state.error}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          {state.ok ? <span className="text-sm text-success">Saved</span> : null}
        </div>
      </form>

      <div className="border-t border-line pt-4">
        <Button
          type="button"
          variant="danger"
          disabled={isDeleting}
          onClick={() => {
            if (!confirmingDelete) {
              setConfirmingDelete(true);
              return;
            }
            startTransition(async () => {
              await deleteCourse(course.id);
            });
          }}
        >
          {confirmingDelete
            ? "Click again to delete — this removes every deck and question"
            : "Delete course"}
        </Button>
      </div>
    </Card>
  );
}
