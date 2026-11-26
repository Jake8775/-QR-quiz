import { z } from "zod";

// SOLO mode: like GROUP mode's setup (topic/questions-per-author/time
// limit), but with no groupCount -- a SOLO "group" (really just one
// participant) is created dynamically per join, not fixed at room
// creation time.
export const soloModeSetupSchema = z.object({
  topic: z.string().trim().min(1, "주제를 입력해주세요").max(200),
  questionsPerPerson: z
    .number()
    .int()
    .min(1, "개인별 문제 수는 1개 이상이어야 합니다")
    .max(50, "개인별 문제 수는 50개 이하여야 합니다"),
  timeLimitSeconds: z
    .number()
    .int()
    .min(5, "5초 이상이어야 합니다")
    .max(300, "300초 이하여야 합니다"),
  optionsCount: z
    .number()
    .int()
    .min(2, "보기 개수는 2개 이상이어야 합니다")
    .max(6, "보기 개수는 6개 이하여야 합니다"),
});

export type SoloModeSetupInput = z.infer<typeof soloModeSetupSchema>;
