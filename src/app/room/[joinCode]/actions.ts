"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { joinRoomSchema } from "@/lib/validation/room";
import { generateGroupPin } from "@/lib/groupMode/pin";

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
    .select("id, active_run_id, quizzes(mode)")
    .eq("public_join_code", joinCode)
    .maybeSingle();
  if (!room || !room.active_run_id) {
    return { success: false, error: "존재하지 않는 방입니다" };
  }
  const quiz = Array.isArray(room.quizzes) ? room.quizzes[0] : room.quizzes;

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
    .select("id, participant_session_id")
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

  // SOLO mode: unlike GROUP/TEAM (which pick an existing team via the
  // group+PIN flow), each participant authors their own single-person
  // "group" -- created here, at join time, with no PIN step needed.
  // Nothing else in the group-authoring pipeline (GroupWorkspace, the
  // workspace/submit/lock/save routes, GroupModeLobbyDashboard,
  // startSoloModeRun's flatten) needs to know a group has exactly one
  // member; it's already written generically against group_id.
  if (quiz?.mode === "SOLO") {
    const { data: settings } = await admin
      .from("solo_mode_settings")
      .select("questions_per_person")
      .eq("run_id", room.active_run_id)
      .maybeSingle();
    if (!settings) {
      return { success: false, error: "개인별 출제전 설정을 찾을 수 없습니다" };
    }

    let groupId: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const pin = generateGroupPin();
      const { data: insertedGroup, error: groupError } = await admin
        .from("groups")
        .insert({ run_id: room.active_run_id, name: nickname, pin, status: "DRAFTING" })
        .select("id")
        .single();
      if (!insertedGroup) {
        // Collision on either (run_id, name) -- duplicate nickname,
        // already rejected above by the participants insert, so this
        // path is PIN collision only -- or (run_id, pin). Retry.
        if (groupError?.code === "23505") continue;
        return { success: false, error: "입장에 실패했습니다. 다시 시도해주세요" };
      }
      groupId = insertedGroup.id;
      break;
    }
    if (!groupId) {
      return { success: false, error: "입장에 실패했습니다. 다시 시도해주세요" };
    }

    const slotRows = Array.from({ length: settings.questions_per_person }, (_, slotIndex) => ({
      group_id: groupId!,
      slot_index: slotIndex,
    }));
    const { error: slotsError } = await admin.from("group_question_slots").insert(slotRows);
    if (slotsError) {
      return { success: false, error: "입장에 실패했습니다. 다시 시도해주세요" };
    }

    const { error: updateError } = await admin
      .from("participants")
      .update({ group_id: groupId })
      .eq("id", participant.id);
    if (updateError) {
      return { success: false, error: "입장에 실패했습니다. 다시 시도해주세요" };
    }
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
