'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { dropsToXrp } from 'xrpl';
import { api } from '~/trpc/react';

interface ChannelGroup {
	senderId: string;
	senderName: string;
	channels: Array<{
		id: string;
		channelId: string;
		roomId: string;
		roomTitle: string;
		lastAmount: string | null;
		lastSignature: string | null;
		status: string;
		amount: string;
	}>;
	totalClaimable: number;
}

export default function PaymentClaimsPage() {
	const router = useRouter();
	const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingChannel, setProcessingChannel] = useState<string | null>(null);
	const [userId, setUserId] = useState<string | null>(null);
	const [isCheckingAuth, setIsCheckingAuth] = useState(true);

	// Check authentication on client side
	useEffect(() => {
		const storedUserId = localStorage.getItem('userId');
		setUserId(storedUserId);
		setIsCheckingAuth(false);
		
		if (!storedUserId) {
			router.push('/auth/signin');
		}
	}, [router]);

	// Get all channels where user is receiver
	const { data: userInfo } = api.user.getCurrentUser.useQuery(undefined, {
		enabled: !!userId,
	});

	// Get all open channels where the user is the receiver
	const { data: channels, refetch: refetchChannels } = api.paymentChannel.getAllReceivedChannels.useQuery(
		undefined,
		{
			enabled: !!userId,
		},
	);

	const { mutateAsync: claimChannel } = api.paymentChannel.claimChannel.useMutation();
	const { mutateAsync: confirmClaimAndReset } = api.paymentChannel.confirmClaimAndReset.useMutation();
	const { mutateAsync: getPayloadResult } = api.xumm.getPayloadResult.useMutation();

	// Group channels by sender
	const groupedChannels: ChannelGroup[] = channels
		? Object.values(
				channels.reduce((acc: Record<string, ChannelGroup>, channel) => {
					if (!acc[channel.senderId]) {
						acc[channel.senderId] = {
							senderId: channel.senderId,
							senderName: channel.sender.nickname || channel.sender.walletAddress.slice(0, 8) + '...',
							channels: [],
							totalClaimable: 0,
						};
					}
					
					const group = acc[channel.senderId];
					if (group) {
						group.channels.push({
							id: channel.id,
							channelId: channel.channelId,
							roomId: channel.roomId,
							roomTitle: channel.room.title,
							lastAmount: channel.lastAmount,
							lastSignature: channel.lastSignature,
							status: channel.status,
							amount: channel.amount,
						});
						
						if (channel.lastAmount) {
							group.totalClaimable += Number(dropsToXrp(channel.lastAmount));
						}
					}
					
					return acc;
				}, {}),
		  )
		: [];

	// Calculate total claimable amount
	const totalClaimableAmount = groupedChannels.reduce((sum, group) => sum + group.totalClaimable, 0);

	const handleSelectAll = () => {
		if (selectedChannels.length === channels?.length) {
			setSelectedChannels([]);
		} else {
			setSelectedChannels(channels?.map((ch) => ch.channelId) || []);
		}
	};

	const handleToggleChannel = (channelId: string) => {
		setSelectedChannels((prev) =>
			prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId],
		);
	};

	const handleClaimChannel = async (channelId: string) => {
		try {
			setIsProcessing(true);
			setProcessingChannel(channelId);

			const result = await claimChannel({ channelId });

			if (result.payload) {
				console.log('Payload created:', JSON.stringify(result.payload, null, 2));
				
				// Use the correct property names from createTransactionPayload
				const deeplink = result.payload.deeplink as string | undefined;
				const qrCode = result.payload.qrUrl as string | undefined;
				
				// Open Xumm directly with the deeplink
				if (deeplink) {
					console.log('Opening deeplink:', deeplink);
					window.open(deeplink, '_blank');
					
					// Show message to user
					await new Promise(resolve => {
						setTimeout(() => {
							alert('Xummウォレットで署名を完了してください。\n\n署名が完了したらOKを押してください。');
							resolve(undefined);
						}, 2000);
					});
					
					// Reset lastSignature and lastAmount after claim
					try {
						await confirmClaimAndReset({ channelId });
						console.log('✅ Channel reset after claim');
					} catch (error) {
						console.error('Failed to reset channel:', error);
					}
					
					// Refetch to check if claim was successful
					await refetchChannels();
				} else if (qrCode) {
					// If on desktop, show QR code
					console.log('Opening QR Code URL:', qrCode);
					window.open(qrCode, '_blank');
					
					await new Promise(resolve => {
						setTimeout(() => {
							alert('QRコードをXummアプリでスキャンしてください。\n\n署名が完了したらOKを押してください。');
							resolve(undefined);
						}, 2000);
					});
					
					// Reset lastSignature and lastAmount after claim
					try {
						await confirmClaimAndReset({ channelId });
						console.log('✅ Channel reset after claim');
					} catch (error) {
						console.error('Failed to reset channel:', error);
					}
					
					await refetchChannels();
				} else {
					console.error('Payload structure:', result.payload);
					throw new Error('No deeplink or QR code found in payload response. Check console for payload structure.');
				}
			}
		} catch (error) {
			console.error('Failed to claim channel:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			alert(`Payment Channelのクレームに失敗しました: ${errorMessage}`);
		} finally {
			setIsProcessing(false);
			setProcessingChannel(null);
		}
	};

	const handleBatchClaim = async () => {
		if (selectedChannels.length === 0) {
			alert('クレームするチャネルを選択してください');
			return;
		}

		if (!confirm(`${selectedChannels.length}個のチャネルをクレームしますか？\n\n各チャネルごとにXummウォレットでの署名が必要です。`)) {
			return;
		}

		try {
			setIsProcessing(true);

			for (const channelId of selectedChannels) {
				setProcessingChannel(channelId);

				try {
					const result = await claimChannel({ channelId });

					if (result.payload) {
						console.log('Payload created for channel:', channelId, JSON.stringify(result.payload, null, 2));
						
						// Use the correct property names from createTransactionPayload
						const deeplink = result.payload.deeplink as string | undefined;
						const qrCode = result.payload.qrUrl as string | undefined;
						
						// Open Xumm directly with the deeplink
						if (deeplink) {
							console.log('Opening deeplink:', deeplink);
							window.open(deeplink, '_blank');
							
							// Wait for user to complete the signature
							await new Promise(resolve => {
								setTimeout(() => {
									if (selectedChannels.indexOf(channelId) === selectedChannels.length - 1) {
										alert('Xummウォレットで署名を完了してください。\n\n全ての署名が完了したらOKを押してください。');
									} else {
										alert(`チャネル ${selectedChannels.indexOf(channelId) + 1}/${selectedChannels.length} の署名を完了してください。\n\n署名が完了したらOKを押して次のチャネルに進んでください。`);
									}
									resolve(undefined);
								}, 2000);
							});
						} else if (qrCode) {
							// If on desktop, show QR code
							console.log('Opening QR Code URL:', qrCode);
							window.open(qrCode, '_blank');
							
							await new Promise(resolve => {
								setTimeout(() => {
									alert(`チャネル ${selectedChannels.indexOf(channelId) + 1}/${selectedChannels.length} のQRコードをXummアプリでスキャンしてください。\n\n署名が完了したらOKを押してください。`);
									resolve(undefined);
								}, 2000);
							});
						} else {
							console.error('Payload structure for channel', channelId, ':', result.payload);
						}
						
						// Reset lastSignature and lastAmount after claim
						try {
							await confirmClaimAndReset({ channelId });
							console.log('✅ Channel reset after claim:', channelId);
						} catch (error) {
							console.error('Failed to reset channel:', error);
						}
					}
				} catch (error) {
					console.error(`Failed to claim channel ${channelId}:`, error);
				}

				// Rate limiting
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			alert('選択したチャネルのクレームを完了しました');
			refetchChannels();
			setSelectedChannels([]);
		} catch (error) {
			console.error('Failed to batch claim channels:', error);
			alert('チャネルの一括クレームに失敗しました');
		} finally {
			setIsProcessing(false);
			setProcessingChannel(null);
		}
	};

	// Show loading state while checking authentication
	if (isCheckingAuth) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<p>Loading...</p>
			</main>
		);
	}

	// This should not render since we redirect in useEffect, but kept for safety
	if (!userId) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<p>ログインが必要です</p>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container mx-auto px-4 py-8">
				<div className="mx-auto max-w-6xl">
					<div className="mb-8 flex items-center justify-between">
						<h1 className="font-bold text-3xl">Payment Channel クレーム管理</h1>
						<button
							type="button"
							onClick={() => router.push('/dashboard')}
							className="rounded bg-gray-600 px-4 py-2 transition hover:bg-gray-700"
						>
							ダッシュボードに戻る
						</button>
					</div>

					{userInfo && (
						<div className="mb-6 rounded-lg bg-white/10 p-6">
							<h2 className="mb-2 font-semibold text-lg">アカウント情報</h2>
							<p className="text-gray-400">
								ウォレット: {userInfo.walletAddress}
							</p>
							<p className="text-gray-400">
								ニックネーム: {userInfo.nickname || '未設定'}
							</p>
						</div>
					)}

					<div className="mb-6 rounded-lg bg-blue-900/50 p-6">
						<h2 className="mb-2 font-semibold text-lg">クレーム可能な総額</h2>
						<p className="font-mono text-3xl text-blue-300">
							{totalClaimableAmount.toFixed(6)} XRP
						</p>
						<p className="mt-2 text-gray-400 text-sm">
							{channels?.filter((ch) => ch.lastAmount && ch.lastSignature).length || 0} 個のチャネルでクレーム可能
						</p>
					</div>

					{channels && channels.length > 0 && (
						<div className="mb-4 flex items-center justify-between">
							<h3 className="font-bold text-xl">受信Payment Channels</h3>
							<div className="flex gap-2">
								<button
									type="button"
									onClick={handleSelectAll}
									className="rounded bg-gray-600 px-4 py-2 text-sm transition hover:bg-gray-700"
								>
									{selectedChannels.length === channels.length ? '選択解除' : '全て選択'}
								</button>
								<button
									type="button"
									onClick={handleBatchClaim}
									disabled={isProcessing || selectedChannels.length === 0}
									className="rounded bg-green-600 px-6 py-2 font-semibold transition hover:bg-green-700 disabled:opacity-50"
								>
									{isProcessing ? '処理中...' : `順次クレーム (${selectedChannels.length})`}
								</button>
							</div>
						</div>
					)}

					<div className="space-y-6">
						{groupedChannels.map((group) => (
							<div key={group.senderId} className="rounded-lg bg-white/10 p-6">
								<div className="mb-4 flex items-center justify-between">
									<div>
										<h3 className="font-semibold text-lg">{group.senderName}</h3>
										<p className="text-gray-400 text-sm">
											送信者ID: {group.senderId}
										</p>
									</div>
									<div className="text-right">
										<p className="font-mono text-xl text-green-400">
											{group.totalClaimable.toFixed(6)} XRP
										</p>
										<p className="text-gray-400 text-sm">
											{group.channels.length} チャネル
										</p>
									</div>
								</div>

								<div className="space-y-3">
									{group.channels.map((channel) => {
										const isClaimable = channel.lastAmount && channel.lastSignature;
										const isSelected = selectedChannels.includes(channel.channelId);
										const isProcessingThis = processingChannel === channel.channelId;

										return (
											<div
												key={channel.id}
												className={`rounded-lg border-2 p-4 transition ${
													isSelected
														? 'border-blue-500 bg-blue-900/30'
														: 'border-transparent bg-white/5'
												} ${!isClaimable ? 'opacity-50' : 'cursor-pointer hover:bg-white/10'}`}
												onClick={() => isClaimable && handleToggleChannel(channel.channelId)}
											>
												<div className="flex items-start justify-between">
													<div className="flex-1">
														<p className="mb-1 font-semibold">{channel.roomTitle}</p>
														<p className="font-mono text-gray-400 text-sm">
															Channel: {channel.channelId.slice(0, 16)}...
														</p>
														<p className="text-gray-400 text-sm">
															デポジット: {Number(dropsToXrp(channel.amount)).toFixed(6)} XRP
														</p>
														{channel.lastAmount && (
															<p className="text-green-400 text-sm">
																クレーム可能: {Number(dropsToXrp(channel.lastAmount)).toFixed(6)} XRP
															</p>
														)}
													</div>
													<div className="flex items-center gap-2">
														{isClaimable && (
															<>
																<input
																	type="checkbox"
																	checked={isSelected}
																	onChange={() => handleToggleChannel(channel.channelId)}
																	onClick={(e) => e.stopPropagation()}
																	className="h-5 w-5"
																/>
																<button
																	type="button"
																	onClick={(e) => {
																		e.stopPropagation();
																		handleClaimChannel(channel.channelId);
																	}}
																	disabled={isProcessing}
																	className="rounded bg-green-600 px-3 py-1 font-semibold text-sm transition hover:bg-green-700 disabled:opacity-50"
																>
																	{isProcessingThis ? '処理中...' : 'クレーム'}
																</button>
															</>
														)}
														<span
															className={`rounded px-2 py-1 text-xs ${
																channel.status === 'OPEN'
																	? 'bg-green-900/50 text-green-400'
																	: channel.status === 'CLOSING'
																		? 'bg-yellow-900/50 text-yellow-400'
																		: 'bg-gray-900/50 text-gray-400'
															}`}
														>
															{channel.status}
														</span>
													</div>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						))}
					</div>

					{(!channels || channels.length === 0) && (
						<div className="rounded-lg bg-white/10 p-8 text-center">
							<p className="text-gray-400">受信したPayment Channelがありません</p>
							<p className="text-gray-500 text-sm mt-2">
								他のユーザーがあなたのアドレス宛にPayment Channelを作成すると、ここに表示されます。
							</p>
							{userInfo && (
								<div className="mt-4 p-4 bg-black/30 rounded text-xs text-left">
									<p className="text-gray-400">デバッグ情報:</p>
									<p className="text-gray-500">あなたのウォレット: {userInfo.walletAddress}</p>
									<p className="text-gray-500">ユーザーID: {userId}</p>
									<p className="text-gray-500">チャネル数: {channels?.length || 0}</p>
								</div>
							)}
						</div>
					)}

					<div className="mt-8 rounded-lg bg-yellow-900/50 p-4">
						<h3 className="mb-2 font-semibold text-yellow-300">クレーム機能について</h3>
						<ul className="space-y-1 text-sm text-yellow-300">
							<li>• クレームを実行すると、署名された金額がウォレットに入金されます</li>
							<li>• 各クレームはXummウォレットでの署名が必要です</li>
							<li>• 複数選択した場合は、各チャネルごとに順番に署名画面が表示されます</li>
							<li>• クレーム後もチャネルは開いたままになり、追加の支払いを受け取ることができます</li>
							<li>• チャネルを完全に閉じる場合は、Payment Channels管理ページから実行してください</li>
						</ul>
					</div>
				</div>
			</div>
		</main>
	);
}