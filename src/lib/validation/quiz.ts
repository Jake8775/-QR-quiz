import { z } from "zod";

export const optionDraftSchema = z.object({
  tempId: z.string().min(1),
  optionText: z.string().trim().min(1, "보기를 입력해주세요").max(200),
});

export const questionDraftSchema = z
  .object({
    tempId: z.string().min(1),
    questionText: z.string().trim().min(1, "질문을 입력해주세요").max(500),
    timeLimitSeconds: z
      .number()
      .int()
      .min(5, "5초 이상이어야 합니다")
      .max(300, "300초 이하여야 합니다"),
    options: z
      .array(optionDraftSchema)
      .min(2, "보기는 최소 2개입니다")
      .max(6, "보기는 최대 6개입니다"),
    correctOptionTempId: z.string().min(1, "정답을 선택해주세요"),
  })
  .refine((q) => q.options.some((o) => o.tempId === q.correctOptionTempId), {
    message: "정답으로 선택한 보기가 존재하지 않습니다",
    path: ["correctOptionTempId"],
  });

export const quizEditorSchema = z.object({
  quizId: z.string().uuid().nullable(),
  title: z.string().trim().min(1, "제목을 입력해주세요").max(200),
  questions: z
    .array(questionDraftSchema)
    .min(1, "문제를 1개 이상 추가해주세요"),
});

export type OptionDraft = z.infer<typeof optionDraftSchema>;
export type QuestionDraft = z.infer<typeof questionDraftSchema>;
export type QuizEditorInput = z.infer<typeof quizEditorSchema>;
