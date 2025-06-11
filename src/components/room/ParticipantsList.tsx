import type { ParticipantsListProps } from "./types";

export function ParticipantsList({
  participants,
  isHost,
  roomId,
  onGrantSpeak,
  onRevokeSpeak,
}: ParticipantsListProps) {
  const handleGrantSpeak = (participantId: string, participant: any) => {
    console.log("🚀 Granting speak permission", { roomId, participantId, participant });
    onGrantSpeak(participantId);
  };

  const handleRevokeSpeak = (participantId: string, participant: any) => {
    console.log("🚀 Revoking speak permission", { roomId, participantId, participant });
    onRevokeSpeak(participantId);
  };

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {participants.length > 0 ? (
        participants.map((p) => (
          <div key={p.id} className="rounded-lg bg-white/5 p-4">
            <p className="font-semibold">
              {p.user.nickname || p.user.walletAddress.slice(0, 8)}...
            </p>
            <p className="text-gray-400 text-sm">
              {p.role === "HOST"
                ? "ホスト"
                : p.canSpeak
                  ? "スピーカー"
                  : "リスナー"}
            </p>
            {p.speakRequestedAt && !p.canSpeak && (
              <p className="mt-1 text-xs text-yellow-400">発言権リクエスト中</p>
            )}
            {isHost && p.role !== "HOST" && (
              <div className="mt-2 flex gap-2">
                {!p.canSpeak && p.speakRequestedAt && (
                  <button
                    type="button"
                    onClick={() => handleGrantSpeak(p.id, p)}
                    className="rounded bg-green-600 px-3 py-1 text-xs hover:bg-green-700"
                  >
                    許可
                  </button>
                )}
                {p.canSpeak && (
                  <button
                    type="button"
                    onClick={() => handleRevokeSpeak(p.id, p)}
                    className="rounded bg-red-600 px-3 py-1 text-xs hover:bg-red-700"
                  >
                    取消
                  </button>
                )}
              </div>
            )}
          </div>
        ))
      ) : (
        <p className="col-span-full text-center text-gray-400">
          参加者はまだいません
        </p>
      )}
    </div>
  );
} 