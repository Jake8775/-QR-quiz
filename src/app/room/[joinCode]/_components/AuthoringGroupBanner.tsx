export function AuthoringGroupBanner({
  authoringGroup,
}: {
  authoringGroup: { name: string; members: string[] } | undefined;
}) {
  if (!authoringGroup) return null;
  return (
    <p className="mb-2 text-center text-sm text-zinc-500">
      출제: {authoringGroup.name} - {authoringGroup.members.join(", ")}
    </p>
  );
}
