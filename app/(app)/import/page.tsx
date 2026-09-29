import { redirect } from "next/navigation";

import { Importer } from "./Importer";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { listCourses, listDecksWithCourse } from "@/lib/data";

export const metadata = { title: "Import · Memorizer" };

export default async function ImportPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (session.role !== "admin") {
    return (
      <div className="space-y-8">
        <PageHeader title="Import questions" />
        <EmptyState
          title="Admin password required"
          description="Sign in with the admin password to import questions."
          action={<ButtonLink href="/">Back to study</ButtonLink>}
        />
      </div>
    );
  }

  const [courses, decks] = await Promise.all([listCourses(), listDecksWithCourse()]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Import questions"
        subtitle="Upload a spreadsheet, check how the columns were read, then confirm."
      />
      <Importer courses={courses} decks={decks} />
    </div>
  );
}
