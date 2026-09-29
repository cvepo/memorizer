import { ThemeToggle } from "@/components/ThemeToggle";
import { LoginForm } from "@/app/login/LoginForm";
import { listProfiles } from "@/lib/data";

export const metadata = { title: "Sign in · BIOMI Study" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  // The password screen must render even before the database is reachable.
  let profiles: string[] = [];
  try {
    profiles = (await listProfiles()).map((profile) => profile.name);
  } catch {
    profiles = [];
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">BIOMI Study</h1>
          <p className="mt-2 text-sm text-muted">
            Sign in with the shared password, or as admin. Your name keeps everyone&apos;s mastery
            separate.
          </p>
        </div>

        <LoginForm profiles={profiles} next={typeof next === "string" ? next : "/"} />
      </div>
    </main>
  );
}
