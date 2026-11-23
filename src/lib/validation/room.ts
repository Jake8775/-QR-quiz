import { z } from "zod";

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, "닉네임을 입력해주세요")
  .max(20, "닉네임은 20자 이하로 입력해주세요");

export const joinRoomSchema = z.object({
  nickname: nicknameSchema,
});

export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
