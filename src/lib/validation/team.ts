import { z } from "zod";
import { questionDraftSchema } from "@/lib/validation/quiz";

// TEAM mode: the presenter authors questions exactly like NORMAL mode
// (questionDraftSchema reused unmodified), but adds one extra setting --
// how many teams participants will split into via the group+PIN flow.
export const teamModeSetupSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요").max(200),
  groupCount: z
    .number()
    .int()
    .min(2, "조 개수는 2개 이상이어야 합니다")
    .max(20, "조 개수는 20개 이하여야 합니다"),
  questions: z
    .array(questionDraftSchema)
    .min(1, "문제를 1개 이상 추가해주세요"),
});

export type TeamModeSetupInput = z.infer<typeof teamModeSetupSchema>;
