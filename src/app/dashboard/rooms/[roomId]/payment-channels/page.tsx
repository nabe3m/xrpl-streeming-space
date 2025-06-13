'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { dropsToXrp } from 'xrpl';
import { api } from '~/trpc/react';

export default function PaymentChannelsPage() {
	const params = useParams();
	const router = useRouter();
	const roomId = params.roomId as string;

	const [isClosing, setIsClosing] = useState(false);
	const [userId, setUserId] = useState<string | null>(null);
	const [isCheckingAuth, setIsCheckingAuth] = useState(true);

	// Check authentication on client side
	useEffect(() => {
		const storedUserId = localStorage.getItem('userId');
		setUserId(storedUserId);
		setIsCheckingAuth(false);
	}, []);

	// ルーム情報を取得
	const { data: room } = api.room.get.useQuery({ id: roomId });

	// Payment Channelsを取得
	const { data: channels, refetch: refetchChannels } =
		api.paymentChannel.getChannelsForRoom.useQuery(
			{ roomId },
			{
				enabled: !!userId && !!room && room.creatorId === userId,
			},
		);

	const { mutateAsync: batchCloseChannels } = api.paymentChannel.batchCloseChannels.useMutation();

	// Show loading state while checking authentication
	if (isCheckingAuth) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<p>Loading...</p>
			</main>
		);
	}

	// ホスト権限チェック
	if (room && room.creatorId !== userId) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<p>このページへのアクセス権限がありません</p>
			</main>
		);
	}

	const handleBatchClose = async () => {
		if (!channels || channels.length === 0) return;

		try {
			setIsClosing(true);

			const result = await batchCloseChannels({ roomId });

			if (result.results.length === 0) {
				alert('クローズ可能なチャネルがありません');
				return;
			}

			// Process each transaction with Xumm
			for (let i = 0; i < result.results.length; i++) {
				const closeResult = result.results[i];
				if (!closeResult) continue;
				
				const { channelId, payload } = closeResult;
				console.log('Processing channel:', channelId, payload);

				// Check for different possible property names
				const deeplink = payload.deeplink;
				const qrCode = payload.qrUrl;
				
				if (deeplink) {
					console.log('Opening deeplink:', deeplink);
					window.open(deeplink, '_blank');
					
					// Wait for user to complete the signature
					await new Promise(resolve => {
						setTimeout(() => {
							if (i === result.results.length - 1) {
								alert('Xummウォレットで署名を完了してください。\n\n全ての署名が完了したらOKを押してください。');
							} else {
								alert(`チャネル ${i + 1}/${result.results.length} の署名を完了してください。\n\n署名が完了したらOKを押して次のチャネルに進んでください。`);
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
							alert(`チャネル ${i + 1}/${result.results.length} のQRコードをXummアプリでスキャンしてください。\n\n署名が完了したらOKを押してください。`);
							resolve(undefined);
						}, 2000);
					});
				} else {
					console.error('Payload structure for channel', channelId, ':', payload);
				}
				
				// Rate limiting between channels
				if (i < result.results.length - 1) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}

			alert('Payment Channelsのクローズを完了しました');
			refetchChannels();
		} catch (error) {
			console.error('Failed to batch close channels:', error);
			alert('Payment Channelsのクローズに失敗しました');
		} finally {
			setIsClosing(false);
		}
	};

	const totalAmount =
		channels?.reduce((sum, ch) => {
			return sum + (ch.lastAmount ? Number(dropsToXrp(ch.lastAmount)) : 0);
		}, 0) || 0;

	return (
		<main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container mx-auto px-4 py-8">
				<div className="mx-auto max-w-4xl">
					<h1 className="mb-8 font-bold text-3xl">Payment Channels管理</h1>
					{room && (
						<div className="mb-6 rounded-lg bg-white/10 p-6">
							<h2 className="mb-2 font-bold text-xl">{room.title}</h2>
							<p className="mb-4 text-gray-400">Room ID: {roomId}</p>
							<button
								type="button"
								onClick={() => router.push('/dashboard')}
								className="rounded bg-gray-600 px-4 py-2 transition hover:bg-gray-700"
							>
								ダッシュボードに戻る
							</button>
						</div>
					)}

					<div className="mb-4 rounded-lg bg-blue-900/50 p-4">
						<p className="text-blue-300 text-sm">
							💡 ヒント: 支払いをクレームのみ（チャネルを閉じない）場合は、
							<Link href="/dashboard/payment-claims" className="underline hover:text-blue-200">
								Payment Claims管理ページ
							</Link>
							をご利用ください。
						</p>
					</div>

					<div className="rounded-lg bg-white/10 p-6">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="font-bold text-xl">受信Payment Channels</h3>
							<button
								type="button"
								onClick={handleBatchClose}
								disabled={isClosing || !channels || channels.length === 0}
								className="rounded bg-green-600 px-6 py-2 font-semibold transition hover:bg-green-700 disabled:opacity-50"
							>
								{isClosing ? 'クローズ中...' : '順次クローズ'}
							</button>
						</div>

						{channels && channels.length > 0 ? (
							<>
								<div className="mb-4 rounded bg-blue-900/50 p-3">
									<p className="text-blue-300 text-sm">
										合計受信額:{' '}
										<span className="font-mono text-lg">{totalAmount.toFixed(6)} XRP</span>
									</p>
								</div>
								<div className="space-y-4">
									{channels.map((channel) => (
										<div key={channel.id} className="rounded-lg bg-white/5 p-4">
											<div className="mb-2 flex items-start justify-between">
												<div>
													<p className="font-semibold">
														{channel.sender.nickname || channel.sender.walletAddress.slice(0, 8)}...
													</p>
													<p className="text-gray-400 text-sm">
														Channel ID: {channel.channelId.slice(0, 16)}...
													</p>
												</div>
												<div className="text-right">
													<p className="font-mono text-lg">
														{channel.lastAmount ? dropsToXrp(channel.lastAmount) : '0'} XRP
													</p>
													<p
														className={`text-sm ${
															channel.status === 'OPEN'
																? 'text-green-400'
																: channel.status === 'CLOSING'
																	? 'text-yellow-400'
																	: 'text-gray-400'
														}`}
													>
														{channel.status}
													</p>
												</div>
											</div>
											{channel.lastSignature && (
												<div className="mt-2 rounded bg-gray-800 p-2">
													<p className="font-mono text-gray-400 text-xs">
														Last Signature: {channel.lastSignature.slice(0, 32)}...
													</p>
												</div>
											)}
										</div>
									))}
								</div>
							</>
						) : (
							<p className="text-center text-gray-400">Payment Channelsがありません</p>
						)}
					</div>
				</div>
			</div>
		</main>
	);
}
