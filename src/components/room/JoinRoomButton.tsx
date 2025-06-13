import { dropsToXrp } from 'xrpl';
import type { JoinRoomButtonProps } from './types';

export function JoinRoomButton({
	room,
	userId,
	isHost,
	myChannel,
	isJoining,
	isLoadingChannel,
	onJoinRoom,
}: JoinRoomButtonProps) {
	if (room.status === 'ENDED') {
		return (
			<div className="text-center">
				<p className="mb-4 text-gray-400">このルームは終了しました</p>
			</div>
		);
	}

	// Check if host is in the room
	const isHostInRoom = isHost || room.participants.some((p) => p.role === 'HOST');

	const canAffordViewing =
		!isHost && room.xrpPerMinute > 0 && myChannel
			? Math.floor(
					Number(dropsToXrp(BigInt(myChannel.amount) - BigInt(myChannel.lastAmount || '0'))) /
						room.xrpPerMinute,
				) > 0
			: true;

	return (
		<div className="text-center">
			<p className="mb-4 text-gray-300">
				{room.status === 'WAITING' ? 'ルームはまだ開始されていません' : 'ルームに参加しますか？'}
			</p>

			<button
				type="button"
				onClick={onJoinRoom}
				disabled={
					isJoining || 
					isLoadingChannel || 
					!isHostInRoom ||
					(!isHost && room.xrpPerMinute > 0 && !canAffordViewing)
				}
				className="w-full rounded-full bg-blue-600 px-8 py-3 font-semibold text-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isJoining
					? '参加中...'
					: isLoadingChannel
						? 'チャネル確認中...'
						: !isHostInRoom && !isHost
							? 'ホスト待機中...'
							: room.status === 'WAITING'
								? 'ルームに参加 (開始待ち)'
								: 'ルームに参加'}
			</button>
			
			{/* Display reason why join is disabled */}
			{!isHostInRoom && !isHost && (
				<p className="mt-2 text-sm text-gray-400">
					🔄 ホストがルームに入るまでお待ちください
				</p>
			)}
			{!isHost && room.xrpPerMinute > 0 && !canAffordViewing && myChannel && (
				<p className="mt-2 text-sm text-red-300">
					⚠️ 残高不足です。デポジットを追加してください
				</p>
			)}
			{!isHost && room.xrpPerMinute > 0 && !myChannel && !isLoadingChannel && (
				<p className="mt-2 text-sm text-yellow-300">
					💳 参加にはペイメントチャネルの作成が必要です
				</p>
			)}
		</div>
	);
}
