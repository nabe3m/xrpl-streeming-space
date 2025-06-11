import type { RoomInfoProps } from "./types";

export function RoomInfo({ room, participantCount }: RoomInfoProps) {
  return (
    <div className="mb-6 rounded-lg bg-white/10 p-6">
      <h1 className="mb-4 font-bold text-3xl">{room.title}</h1>
      {room.description && (
        <p className="mb-4 text-gray-300">{room.description}</p>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-sm">
            Host:{" "}
            {room.creator.nickname ||
              room.creator.walletAddress.slice(0, 8)}
            ...
          </p>
          <p className="text-sm text-yellow-400">
            料金: {room.xrpPerMinute} XRP/分
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-sm">
            状態:{" "}
            {room.status === "LIVE"
              ? "配信中"
              : room.status === "WAITING"
                ? "開始前"
                : "終了"}
          </p>
          <p className="text-gray-400 text-sm">
            参加者: {participantCount}人
          </p>
        </div>
      </div>
    </div>
  );
} 