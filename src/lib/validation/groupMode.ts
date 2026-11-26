import { z } from "zod";

export const groupModeSetupSchema = z.object({
  topic: z.string().trim().min(1, "주제를 입력해주세요").max(200),
  groupCount: z
    .number()
    .int()
    .min(2, "조 개수는 2개 이상이어야 합니다")
    .max(20, "조 개수는 20개 이하여야 합니다"),
  questionsPerGroup: z
    .number()
    .int()
    .min(1, "조별 문제 수는 1개 이상이어야 합니다")
    .max(50, "조별 문제 수는 50개 이하여야 합니다"),
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

export type GroupModeSetupInput = z.infer<typeof groupModeSetupSchema>;
