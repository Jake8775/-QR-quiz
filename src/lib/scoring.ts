export function computeAwardedPoints(
  submittedAt: Date,
  openedAt: Date,
  timeLimitSeconds: number,
  maxPoints: number,
  minPoints: number,
): number {
  const responseSeconds =
    (submittedAt.getTime() - openedAt.getTime()) / 1000;
  if (responseSeconds < 0.5) return maxPoints;
  if (maxPoints === minPoints) return maxPoints;
  const ratio = Math.min(1, responseSeconds / timeLimitSeconds);
  return Math.max(
    minPoints,
    Math.round(maxPoints - (maxPoints - minPoints) * ratio),
  );
}
