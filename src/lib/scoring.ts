export const MAX_POINTS = 1000;

export function computeAwardedPoints(
  submittedAt: Date,
  openedAt: Date,
  timeLimitSeconds: number,
): number {
  const responseSeconds =
    (submittedAt.getTime() - openedAt.getTime()) / 1000;
  if (responseSeconds < 0.5) return MAX_POINTS;
  const ratio = responseSeconds / (2 * timeLimitSeconds);
  return Math.max(0, Math.round(MAX_POINTS * (1 - ratio)));
}
