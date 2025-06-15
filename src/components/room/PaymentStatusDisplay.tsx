import { dropsToXrp } from 'xrpl';
import { api } from '~/trpc/react';
import { useEffect } from 'react';

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
	ledgerInfo?: {
		depositAmount: string | number;
		claimedAmount: string | number;
		currentOffLedgerAmount: string | number;
		availableAmount: string | number;
		totalUsed: string | number;
	} | null;
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
	// Fetch channel info from ledger
	// Use myChannel.channelId if available, otherwise fall back to paymentChannelId
	const channelIdToUse = myChannel?.channelId || paymentChannelId;
	const { data: channelInfo, isLoading: isLoadingChannelInfo } = api.paymentChannel.getChannelInfo.useQuery(
		{ channelId: channelIdToUse || '' },
		{
			enabled: !!channelIdToUse && !isHost,
			refetchInterval: 5000, // Refetch every 5 seconds
		}
	);

	// Debug logging for channelInfo (only if channel exists)
	useEffect(() => {
		if (channelIdToUse) {
			console.log('🔍 PaymentStatusDisplay channelInfo debug:', {
				paymentChannelId,
				myChannelId: myChannel?.channelId,
				channelIdToUse,
				channelIdsMatch: paymentChannelId === myChannel?.channelId,
				isHost,
				enabled: !!channelIdToUse && !isHost,
				isLoadingChannelInfo,
				channelInfo,
				hasChannelInfo: !!channelInfo
			});
		}
	}, [paymentChannelId, myChannel, channelIdToUse, isHost, isLoadingChannelInfo, channelInfo]);

	// リスナーの支払い状況表示
	if (channelIdToUse && room?.xrpPerMinute && room.xrpPerMinute > 0 && myChannel) {
		// Use ledger data if available, otherwise fall back to DB data
		let depositAmount: number;
		let claimedAmount: number;
		let availableAmount: number;
		
		if (channelInfo && channelInfo.depositAmount !== undefined) {
			// Use accurate data from ledger
			depositAmount = Number(channelInfo.depositAmount);
			// The "claimedAmount" from API is the ledger balance (already claimed)
			// The "currentOffLedgerAmount" is what's been signed but not claimed yet
			const ledgerClaimedAmount = Number(channelInfo.claimedAmount);
			const currentOffLedgerAmount = Number(channelInfo.currentOffLedgerAmount || 0);
			
			// Total used = ledger claimed + current off-ledger
			claimedAmount = ledgerClaimedAmount + currentOffLedgerAmount;
			availableAmount = Number(channelInfo.availableAmount);
		} else {
			// Fall back to DB data
			const depositAmountDrops = BigInt(myChannel.amount);
			const usedAmountDrops = BigInt(myChannel.lastAmount || '0');
			const availableAmountDrops = depositAmountDrops - usedAmountDrops;
			
			depositAmount = Number(dropsToXrp(depositAmountDrops.toString()));
			claimedAmount = Number(dropsToXrp(usedAmountDrops.toString()));
			availableAmount = availableAmountDrops >= 0n 
				? Number(dropsToXrp(availableAmountDrops.toString()))
				: 0;
		}
		
		// Calculate remaining minutes based on available balance
		const remainingMinutes = Math.max(0, Math.floor(availableAmount / (room.xrpPerMinute || 0.01)));

		return (
			<div className="mt-2 rounded bg-purple-900/50 p-2">
				<p className="text-purple-300 text-xs">支払い状況</p>
				<p className="font-mono text-sm">
					{Math.floor(totalPaidSeconds / 60)}分{totalPaidSeconds % 60}秒 ={' '}
					{(Math.round((totalPaidSeconds / 60) * room.xrpPerMinute * 1000000) / 1000000).toFixed(6)}{' '}
					XRP
				</p>
				<p className="text-purple-400 text-xs">Channel: {channelIdToUse.slice(0, 8)}...</p>
				<div className="mt-1 space-y-1">
					<p className="text-purple-400 text-xs">
						デポジット: {depositAmount.toFixed(6)} XRP
					</p>
					<p className="text-purple-400 text-xs">
						使用済み額: {claimedAmount.toFixed(6)} XRP
						{channelInfo && channelInfo.currentOffLedgerAmount !== undefined && (
							<span className="text-purple-500">
								{' '}(クレーム済: {Number(channelInfo.claimedAmount).toFixed(6)} + オフレジャー: {Number(channelInfo.currentOffLedgerAmount).toFixed(6)})
							</span>
						)}
					</p>
					<p className="text-purple-400 text-xs">
						利用可能残高: {availableAmount.toFixed(6)} XRP (約{remainingMinutes}分)
					</p>
				</div>
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
						let depositAmount: number;
						let usedAmount: number;
						let remainingAmount: number;
						let ledgerClaimedAmount: number | undefined;
						let currentOffLedgerAmount: number | undefined;
						
						if (ch.ledgerInfo) {
							// Use accurate data from ledger
							depositAmount = Number(ch.ledgerInfo.depositAmount);
							usedAmount = Number(ch.ledgerInfo.totalUsed);
							remainingAmount = Number(ch.ledgerInfo.availableAmount);
							ledgerClaimedAmount = Number(ch.ledgerInfo.claimedAmount);
							currentOffLedgerAmount = Number(ch.ledgerInfo.currentOffLedgerAmount);
						} else {
							// Fall back to DB data
							depositAmount = Number(dropsToXrp(ch.amount));
							usedAmount = ch.lastAmount ? Number(dropsToXrp(ch.lastAmount)) : 0;
							remainingAmount = Math.max(0, depositAmount - usedAmount);
						}
						
						// 使用済み時間の計算
						const paidMinutes = Math.floor(usedAmount / (room?.xrpPerMinute || 0.01));
						const paidSeconds = Math.floor((usedAmount / (room?.xrpPerMinute || 0.01)) * 60) % 60;

						return (
							<div key={ch.id} className="rounded bg-black/30 p-2 text-xs">
								<div className="mb-1 flex items-start justify-between">
									<span className="font-medium text-green-400">
										{ch.sender.nickname || ch.sender.walletAddress.slice(0, 8)}
										...
									</span>
									<span className="font-mono text-white">{usedAmount.toFixed(6)} XRP</span>
								</div>
								<div className="space-y-1 text-gray-300">
									<div className="flex justify-between">
										<span>デポジット:</span>
										<span className="text-gray-100">{depositAmount.toFixed(6)} XRP</span>
									</div>
									<div className="flex justify-between">
										<span>使用済み額:</span>
										<span className="text-gray-100">
											{usedAmount.toFixed(6)} XRP
											{ledgerClaimedAmount !== undefined && currentOffLedgerAmount !== undefined && (
												<span className="text-gray-400 text-xs">
													{' '}(クレーム済: {ledgerClaimedAmount.toFixed(6)} + オフレジャー: {currentOffLedgerAmount.toFixed(6)})
												</span>
											)}
										</span>
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
												{new Date(ch.updatedAt).toISOString().slice(11, 19)}
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
									(sum, ch) => {
										// Use ledgerInfo.totalUsed when available, otherwise fall back to lastAmount
										if (ch.ledgerInfo) {
											return sum + Number(ch.ledgerInfo.totalUsed);
										}
										return sum + (ch.lastAmount ? Number(dropsToXrp(ch.lastAmount)) : 0);
									},
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