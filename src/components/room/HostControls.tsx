import type { HostControlsProps } from './types';

export function HostControls({ roomStatus, roomId, onStartRoom, onEndRoom }: HostControlsProps) {
	const handleStartRoom = () => {
		console.log('🚀 handleStartRoom clicked', { roomId, roomStatus });
		try {
			onStartRoom();
		} catch (error) {
			console.error('❌ Error in handleStartRoom:', error);
		}
	};

	const handleEndRoom = () => {
		console.log('🚀 handleEndRoom clicked', { roomId, roomStatus });
		// 確認ダイアログは親コンポーネント側で表示するため、ここでは表示しない
		try {
			onEndRoom();
		} catch (error) {
			console.error('❌ Error in handleEndRoom:', error);
		}
	};

	return (
		<div className="flex gap-2">
			{roomStatus === 'WAITING' && (
				<button
					type="button"
					onClick={handleStartRoom}
					className="rounded-full bg-green-600 px-6 py-2 font-semibold transition hover:bg-green-700"
				>
					配信開始
				</button>
			)}
			{roomStatus === 'LIVE' && (
				<button
					type="button"
					onClick={handleEndRoom}
					className="rounded-full bg-red-600 px-6 py-2 font-semibold transition hover:bg-red-700"
				>
					配信終了
				</button>
			)}
		</div>
	);
}
