import { redirect } from "next/navigation";
import { loadQuizForEdit } from "../../queries";
import { QuizEditor } from "../../_components/QuizEditor";

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  const initialData = await loadQuizForEdit(quizId);
  if (!initialData) {
    redirect("/admin");
  }
  return <QuizEditor initialData={initialData} />;
}
