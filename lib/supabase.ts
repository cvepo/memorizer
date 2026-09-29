import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/types";

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Supabase client built with the project's secret key. Server-only: the key
 * bypasses RLS, so this module must never be imported from a client component.
 */
export function supabase() {
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
