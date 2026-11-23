"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { joinRoomSchema } from "@/lib/validation/room";

const PARTICIPANT_COOKIE = "qz_participant";

export async function joinRoomAction(
  joinCode: string,
  input: { nickname: string },
): Promise<
  | { success: true; participantSessionId: string }
  | { success: false; error: string }
> {
  const parsed = joinRoomSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다",
    };
  }
  const { nickname } = parsed.data;

  // Participants have no Supabase Auth identity -- every read/write here
  // goes through the service-role client exclusively.
  const admin = createAdminClient();

  const { data: room } = await admin
    .from("rooms")
    .select("id, active_run_id")
    .eq("public_join_code", joinCode)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return { success: false, error: "존재하지 않는 방입니다" };
  }

  const { data: run } = await admin
    .from("quiz_runs")
    .select("status")
    .eq("id", room.active_run_id)
    .maybeSingle();
  if (!run) {
    return { success: false, error: "존재하지 않는 방입니다" };
  }

  if (run.status !== "LOBBY") {
    return {
      success: false,
      error: "이미 시작된 퀴즈에는 새로 입장할 수 없습니다",
    };
  }

  const { data: participant, error } = await admin
    .from("participants")
    .insert({ run_id: room.active_run_id, nickname })
    .select("participant_session_id")
    .single();

  if (error || !participant) {
    if (error?.code === "23505") {
      return {
        success: false,
        error: "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요",
      };
    }
    return { success: false, error: "입장에 실패했습니다. 다시 시도해주세요" };
  }

  const cookieStore = await cookies();
  cookieStore.set(PARTICIPANT_COOKIE, participant.participant_session_id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/room/${joinCode}`,
    maxAge: 60 * 60 * 24,
  });

  return { success: true, participantSessionId: participant.participant_session_id };
}
