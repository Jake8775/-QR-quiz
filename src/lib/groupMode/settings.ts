import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

// GROUP rooms have a group_mode_settings row, SOLO rooms have a
// solo_mode_settings row -- exactly one of the two exists for any given
// run, so querying both and taking whichever resolves is safe without
// the caller needing to know quizzes.mode. Used by every save route that
// must enforce the presenter-fixed option count server-side (never trust
// the client alone), not just by the workspace GET route that merely
// displays it.
export async function getOptionsCountForRun(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
): Promise<number | null> {
  const [{ data: groupSettings }, { data: soloSettings }] = await Promise.all([
    admin.from("group_mode_settings").select("options_count").eq("run_id", runId).maybeSingle(),
    admin.from("solo_mode_settings").select("options_count").eq("run_id", runId).maybeSingle(),
  ]);
  return groupSettings?.options_count ?? soloSettings?.options_count ?? null;
}
