import { dropsToXrp } from "xrpl";
import type { JoinRoomButtonProps } from "./types";

export function JoinRoomButton({
  room,
  userId,
  isHost,
  myChannel,
  isJoining,
  isLoadingChannel,
  onJoinRoom,
}: JoinRoomButtonProps) {
  if (room.status === "ENDED") {
    return (
      <div className="text-center">
        <p className="mb-4 text-gray-400">このルームは終了しました</p>
      </div>
    );
  }

  const canAffordViewing = !isHost && room.xrpPerMinute > 0 && myChannel
    ? Math.floor(
        Number(
          dropsToXrp(
            BigInt(myChannel.amount) - BigInt(myChannel.lastAmount || "0"),
          ),
        ) / room.xrpPerMinute,
      ) > 0
    : true;

  return (
    <div className="text-center">
      <p className="mb-4 text-gray-300">
        {room.status === "WAITING"
          ? "ルームはまだ開始されていません"
          : "ルームに参加しますか？"}
      </p>
      
      <button
        type="button"
        onClick={onJoinRoom}
        disabled={
          isJoining ||
          isLoadingChannel ||
          (!isHost && room.xrpPerMinute > 0 && !canAffordViewing)
        }
        className="w-full rounded-full bg-blue-600 px-8 py-3 font-semibold text-lg transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isJoining
          ? "参加中..."
          : isLoadingChannel
            ? "チャネル確認中..."
            : room.status === "WAITING"
              ? "ルームに参加 (開始待ち)"
              : "ルームに参加"}
      </button>
    </div>
  );
} 