import { z } from "zod";

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "닉네임은 2자 이상으로 입력해주세요")
  .max(15, "닉네임은 15자 이하로 입력해주세요");

export const joinRoomSchema = z.object({
  nickname: nicknameSchema,
});

export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
