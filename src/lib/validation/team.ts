import { z } from "zod";

// TEAM mode's quiz content (title/questions) is authored through the
// exact same pipeline as NORMAL mode now (QuizEditor + saveQuizAction,
// see quizzes/new-team/page.tsx) -- this schema only covers the one
// thing that's actually different about creating a TEAM room: how many
// teams participants will split into via the group+PIN flow. Room
// creation is a separate step from quiz authoring, so a presenter can
// reuse the same TEAM quiz across multiple rooms with a different team
// count each time.
export const teamRoomCreateSchema = z.object({
  quizId: z.string().uuid(),
  groupCount: z
    .number()
    .int()
    .min(2, "조 개수는 2개 이상이어야 합니다")
    .max(20, "조 개수는 20개 이하여야 합니다"),
});

export type TeamRoomCreateInput = z.infer<typeof teamRoomCreateSchema>;
