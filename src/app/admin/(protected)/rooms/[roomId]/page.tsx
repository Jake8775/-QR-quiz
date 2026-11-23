import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getRoomForPresenter } from "./queries";
import { LobbyClient } from "./_components/LobbyClient";

async function resolveOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export default async function RoomLobbyPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const room = await getRoomForPresenter(roomId);
  if (!room) {
    redirect("/admin");
  }

  const origin = await resolveOrigin();
  const joinUrl = `${origin}/room/${room.publicJoinCode}`;

  return (
    <LobbyClient
      roomId={room.id}
      joinUrl={joinUrl}
      quizTitle={room.quizTitle}
    />
  );
}
