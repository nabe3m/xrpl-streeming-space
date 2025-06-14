import { dropsToXrp } from 'xrpl';
import type { AudioControlsProps } from './types';

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
	myChannel,
	room,
	isBalanceInsufficient = false,
}: AudioControlsProps) {
	// Calculate if the user has sufficient balance for speaking
	const hasSufficientBalance = () => {
		if (shouldBeHost || !room || room.xrpPerMinute === 0) return true;
		// In NFT mode, no payment channel is needed
		if (room.paymentMode === 'NFT_TICKET') return true;
		if (!myChannel) return false;
		
		try {
			// amountとlastAmountを正しく文字列として扱う
			const amount = myChannel.amount || '0';
			const lastAmount = myChannel.lastAmount || '0';
			
			// BigIntで計算
			const amountBigInt = BigInt(amount);
			const lastAmountBigInt = BigInt(lastAmount);
			const remainingBalance = amountBigInt - lastAmountBigInt;
			
			// 残高が負の場合は0として扱う
			const remainingBalancePositive = remainingBalance < 0n ? 0n : remainingBalance;
			
			// XRPに変換して分単位を計算
			const remainingXRP = Number(dropsToXrp(remainingBalancePositive.toString()));
			const remainingMinutes = remainingXRP / room.xrpPerMinute;
			
			console.log('Balance check:', {
				shouldBeHost,
				roomXrpPerMinute: room?.xrpPerMinute,
				myChannel: myChannel ? {
					amount: amount,
					amountXRP: dropsToXrp(amount),
					lastAmount: lastAmount,
					lastAmountXRP: dropsToXrp(lastAmount),
				} : null,
				remainingBalance: remainingBalancePositive.toString(),
				remainingXRP,
				remainingMinutes,
				hasSufficient: remainingMinutes >= 5,
				isBalanceInsufficient,
			});
			
			// Require at least 5 minutes of balance to request speak permission
			return remainingMinutes >= 1;
		} catch (error) {
			console.error('Error calculating balance:', error);
			return false;
		}
	};

	// Debug button visibility
	const showSpeakRequestButton = !shouldBeHost && !participant?.canSpeak && !participant?.speakRequestedAt;
	console.log('AudioControls render:', {
		showSpeakRequestButton,
		shouldBeHost,
		participant,
		canSpeak,
		isBalanceInsufficient,
		hasSufficientBalance: hasSufficientBalance(),
	});

	return (
		<div className="flex items-center gap-4">
			{/* 音声開始ボタン - 残高不足時は非表示 */}
			{canSpeak && !isPublished && !isBalanceInsufficient && (
				<button
					type="button"
					onClick={async () => {
						console.log('🚀 Starting audio publication', {
							canSpeak,
							isPublished,
							connectionState,
						});
						try {
							console.log(`Current connection state: ${connectionState}`);
							// 接続が確立されるまで待つ
							if (connectionState !== 'CONNECTED') {
								alert('接続が確立されていません。もう少し待ってから再試行してください。');
								return;
							}
							await onPublishAudio();
							console.log('✅ Audio publication started successfully');
						} catch (error) {
							console.error('❌ Failed to publish audio:', error);
							const errorMessage = error instanceof Error ? error.message : 'Unknown error';
							alert(`音声の公開に失敗しました: ${errorMessage}\n\n接続状態: ${connectionState}`);
						}
					}}
					className="rounded-full bg-green-600 px-6 py-2 font-semibold transition hover:bg-green-700"
				>
					音声を開始
				</button>
			)}
			
			{/* ミュートボタン - 残高不足時は非表示 */}
			{isPublished && !isBalanceInsufficient && (
				<button
					type="button"
					onClick={() => {
						console.log('🚀 Toggling mute', { isMuted, isPublished });
						onToggleMute();
					}}
					className={`rounded-full px-6 py-2 font-semibold transition ${
						isMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-600 hover:bg-gray-700'
					}`}
				>
					{isMuted ? 'ミュート解除' : 'ミュート'}
				</button>
			)}
			
			{/* 発言権リクエストボタン - 残高がある場合は常に表示 */}
			{showSpeakRequestButton && (
				<button
					type="button"
					onClick={() => {
						console.log('Speak request button clicked', {
							hasSufficientBalance: hasSufficientBalance(),
							shouldBeHost,
							canSpeak: participant?.canSpeak,
							speakRequestedAt: participant?.speakRequestedAt,
						});
						if (!hasSufficientBalance()) {
							const requiredXRP = room?.xrpPerMinute ? room.xrpPerMinute * 5 : 0;
							alert(`発言権をリクエストするには、最低5分間分（${requiredXRP} XRP）の残高が必要です。デポジットを追加してください。`);
							return;
						}
						console.log('🚀 Requesting speak permission', { roomId, participant });
						onRequestSpeak();
					}}
					disabled={!hasSufficientBalance()}
					className={`rounded-full px-6 py-2 font-semibold transition ${
						hasSufficientBalance()
							? 'bg-purple-600 hover:bg-purple-700'
							: 'bg-gray-500 cursor-not-allowed opacity-50'
					}`}
					title={!hasSufficientBalance() ? '残高不足: 最低5分間分の残高が必要です' : undefined}
				>
					発言権をリクエスト
				</button>
			)}
			
			{/* リクエスト中の表示 */}
			{!shouldBeHost && participant?.speakRequestedAt && !participant?.canSpeak && (
				<button
					type="button"
					disabled
					className="rounded-full bg-gray-500 px-6 py-2 font-semibold opacity-50"
				>
					リクエスト中...
				</button>
			)}
			
			{/* 残高不足時の警告メッセージ */}
			{isBalanceInsufficient && !shouldBeHost && (
				<div className="rounded-full bg-red-600/20 border border-red-500 px-6 py-2 text-red-300">
					⚠️ 残高不足により音声機能が停止されました
				</div>
			)}
			
			{/* 退出ボタンは常に表示 */}
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