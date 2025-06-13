import { dropsToXrp } from 'xrpl';

interface PaymentChannel {
	id: string;
	channelId: string;
	amount: string;
	lastAmount: string | null;
	sender: {
		nickname: string | null;
		walletAddress: string;
	};
	updatedAt: Date;
}

interface PaymentStatusDisplayProps {
	myChannel?:
		| {
				channelId: string;
				amount: string;
				lastAmount: string | null;
		  }
		| null
		| undefined;
	paymentChannelId?: string | null;
	totalPaidSeconds: number;
	room:
		| {
				xrpPerMinute: number | null;
		  }
		| null
		| undefined;
	incomingChannels?: PaymentChannel[] | null;
	isHost: boolean;
	depositAmountXRP: number;
	isAddingDeposit: boolean;
	onAddDeposit: () => void;
	isRemoteAudioPaused?: boolean;
}

export function PaymentStatusDisplay({
	myChannel,
	paymentChannelId,
	totalPaidSeconds,
	room,
	incomingChannels,
	isHost,
	depositAmountXRP,
	isAddingDeposit,
	onAddDeposit,
	isRemoteAudioPaused,
}: PaymentStatusDisplayProps) {
	// リスナーの支払い状況表示
	if (paymentChannelId && room?.xrpPerMinute && room.xrpPerMinute > 0 && myChannel) {
		const depositAmount = Number(dropsToXrp(myChannel.amount));
		const usedAmount = (totalPaidSeconds / 60) * (room.xrpPerMinute || 0);
		const remainingAmount = Math.max(0, depositAmount - usedAmount); // マイナス値を0に制限
		const remainingMinutes = Math.max(0, Math.floor(remainingAmount / (room.xrpPerMinute || 0.01))); // マイナス値を0に制限

		return (
			<div className="mt-2 rounded bg-purple-900/50 p-2">
				<p className="text-purple-300 text-xs">支払い状況</p>
				<p className="font-mono text-sm">
					{Math.floor(totalPaidSeconds / 60)}分{totalPaidSeconds % 60}秒 ={' '}
					{(Math.round((totalPaidSeconds / 60) * room.xrpPerMinute * 1000000) / 1000000).toFixed(6)}{' '}
					XRP
				</p>
				<p className="text-purple-400 text-xs">Channel: {paymentChannelId.slice(0, 8)}...</p>
				<p className="mt-1 text-purple-400 text-xs">
					残高: {remainingAmount.toFixed(6)} XRP (約
					{remainingMinutes}分)
				</p>
				{isRemoteAudioPaused && (
					<div className="mt-2 rounded bg-red-900/50 p-2">
						<p className="text-red-300 text-sm">
							⚠️ 残高不足のためホストからの音声が一時停止されています
						</p>
					</div>
				)}
				{remainingMinutes < 5 && (
					<div className="mt-2">
						<div className="mb-2 rounded-lg bg-blue-900/30 p-2">
							<p className="mb-1 text-blue-300 text-xs">デバッグ情報 (支払い中):</p>
							<pre className="text-blue-100 text-xs">
								{JSON.stringify(
									{
										isAddingDeposit,
										depositAmountXRP,
										remainingMinutes,
										roomXrpPerMinute: room?.xrpPerMinute,
									},
									null,
									2,
								)}
							</pre>
						</div>
						<button
							type="button"
							onMouseEnter={() => console.log('🖱️ Payment deposit button mouse enter')}
							onMouseDown={() => console.log('🖱️ Payment deposit button mouse down')}
							onMouseUp={() => console.log('🖱️ Payment deposit button mouse up')}
							onClick={(e) => {
								console.log('🚀 Payment deposit button clicked!', {
									event: e,
									currentTarget: e.currentTarget,
									target: e.target,
									isAddingDeposit,
									room: room?.xrpPerMinute,
									remainingMinutes,
									timestamp: new Date().toISOString(),
								});
								e.preventDefault();
								e.stopPropagation();

								onAddDeposit();
							}}
							className="w-full rounded-lg border-2 border-yellow-400 bg-yellow-600 px-4 py-2 font-semibold text-white shadow-md transition-all duration-200 hover:bg-yellow-700"
							style={{
								position: 'relative',
								zIndex: 9999,
								pointerEvents: 'auto',
							}}
						>
							デポジットを追加 (支払い中)
						</button>
						<p className="mt-1 text-gray-400 text-xs">
							ボタンが反応しない場合は、ブラウザのコンソールを確認してください
						</p>
					</div>
				)}
			</div>
		);
	}

	// ホストの受信チャネル表示
	if (isHost && incomingChannels && incomingChannels.length > 0) {
		return (
			<div className="mt-2 rounded bg-green-900/50 p-2">
				<p className="mb-2 font-semibold text-green-300 text-xs">受信Payment Channels</p>
				<div className="space-y-2">
					{incomingChannels.map((ch) => {
						const depositAmount = Number(dropsToXrp(ch.amount));
						const paidAmount = ch.lastAmount ? Number(dropsToXrp(ch.lastAmount)) : 0;
						const remainingAmount = depositAmount - paidAmount;
						const paidMinutes = Math.floor(paidAmount / (room?.xrpPerMinute || 0.01));
						const paidSeconds = Math.floor((paidAmount / (room?.xrpPerMinute || 0.01)) * 60) % 60;

						return (
							<div key={ch.id} className="rounded bg-black/30 p-2 text-xs">
								<div className="mb-1 flex items-start justify-between">
									<span className="font-medium text-green-400">
										{ch.sender.nickname || ch.sender.walletAddress.slice(0, 8)}
										...
									</span>
									<span className="font-mono text-white">{paidAmount.toFixed(6)} XRP</span>
								</div>
								<div className="space-y-1 text-gray-300">
									<div className="flex justify-between">
										<span>デポジット:</span>
										<span className="text-gray-100">{depositAmount.toFixed(6)} XRP</span>
									</div>
									<div className="flex justify-between">
										<span>残高:</span>
										<span className={remainingAmount < 1 ? 'text-red-400' : 'text-gray-100'}>
											{remainingAmount.toFixed(6)} XRP
										</span>
									</div>
									<div className="flex justify-between">
										<span>視聴時間:</span>
										<span className="text-gray-100">
											{paidMinutes}分{paidSeconds}秒
										</span>
									</div>
									{ch.updatedAt && (
										<div className="flex justify-between">
											<span>最終更新:</span>
											<span className="text-gray-100">
												{typeof window !== 'undefined'
													? new Date(ch.updatedAt).toLocaleTimeString('ja-JP')
													: '--:--:--'}
											</span>
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
				<div className="mt-2 border-green-700 border-t pt-2">
					<div className="flex justify-between text-xs">
						<span className="text-green-300">合計収益:</span>
						<span className="font-mono font-semibold text-green-100">
							{incomingChannels
								.reduce(
									(sum, ch) => sum + (ch.lastAmount ? Number(dropsToXrp(ch.lastAmount)) : 0),
									0,
								)
								.toFixed(6)}{' '}
							XRP
						</span>
					</div>
				</div>
			</div>
		);
	}

	return null;
}
