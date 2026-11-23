import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS entirely. Never import this file from
// a "use client" component or from anything bundled into the browser.
// This is the only client permitted to read question_answer_keys /
// run_answer_keys, and the only client participant-facing API routes
// (added in a later stage) should use.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
