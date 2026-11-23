import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getRoomForPresenter } from "./queries";
import { JoinQr } from "./_components/JoinQr";
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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm text-zinc-500">대기실</p>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">
        {room.quizTitle}
      </h1>

      <JoinQr joinUrl={joinUrl} />

      <div className="mt-6">
        <LobbyClient roomId={room.id} />
      </div>
    </div>
  );
}
