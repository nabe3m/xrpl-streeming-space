import type { AudioControlsProps } from "./types";

export function AudioControls({
  canSpeak,
  isPublished,
  isMuted,
  connectionState,
  shouldBeHost,
  participant,
  roomId,
  onPublishAudio,
  onToggleMute,
  onRequestSpeak,
  onLeaveRoom,
}: AudioControlsProps) {
  return (
    <div className="flex items-center gap-4">
      {canSpeak && !isPublished && (
        <button
          type="button"
          onClick={async () => {
            console.log("🚀 Starting audio publication", { canSpeak, isPublished, connectionState });
            try {
              console.log(`Current connection state: ${connectionState}`);
              // 接続が確立されるまで待つ
              if (connectionState !== "CONNECTED") {
                alert("接続が確立されていません。もう少し待ってから再試行してください。");
                return;
              }
              await onPublishAudio();
              console.log("✅ Audio publication started successfully");
            } catch (error) {
              console.error("❌ Failed to publish audio:", error);
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              alert(`音声の公開に失敗しました: ${errorMessage}\n\n接続状態: ${connectionState}`);
            }
          }}
          className="rounded-full bg-green-600 px-6 py-2 font-semibold transition hover:bg-green-700"
        >
          音声を開始
        </button>
      )}
      {isPublished && (
        <button
          type="button"
          onClick={() => {
            console.log("🚀 Toggling mute", { isMuted, isPublished });
            onToggleMute();
          }}
          className={`rounded-full px-6 py-2 font-semibold transition ${
            isMuted
              ? "bg-red-600 hover:bg-red-700"
              : "bg-gray-600 hover:bg-gray-700"
          }`}
        >
          {isMuted ? "ミュート解除" : "ミュート"}
        </button>
      )}
      {!shouldBeHost &&
        !participant?.canSpeak &&
        !participant?.speakRequestedAt && (
          <button
            type="button"
            onClick={() => {
              console.log("🚀 Requesting speak permission", { roomId, participant });
              onRequestSpeak();
            }}
            className="rounded-full bg-purple-600 px-6 py-2 font-semibold transition hover:bg-purple-700"
          >
            発言権をリクエスト
          </button>
        )}
      {!shouldBeHost &&
        participant?.speakRequestedAt &&
        !participant?.canSpeak && (
          <button
            type="button"
            disabled
            className="rounded-full bg-gray-500 px-6 py-2 font-semibold opacity-50"
          >
            リクエスト中...
          </button>
        )}
      <button
        type="button"
        onClick={onLeaveRoom}
        className="rounded-full bg-red-600 px-6 py-2 font-semibold transition hover:bg-red-700"
      >
        退出
      </button>
    </div>
  );
} 