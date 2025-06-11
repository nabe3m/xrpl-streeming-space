'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { dropsToXrp } from 'xrpl';
import { Xumm } from 'xumm';
import { env } from '~/env';
import { api } from '~/trpc/react';

export default function PaymentChannelsPage() {
	const params = useParams();
	const router = useRouter();
	const roomId = params.roomId as string;

	const [isClosing, setIsClosing] = useState(false);

	const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

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

			// Xummで各トランザクションを処理
			const xumm = new Xumm(env.NEXT_PUBLIC_XUMM_API_KEY);

			for (const { channelId, payload } of result.results) {
				const subscription = await xumm.payload?.createAndSubscribe(payload as any, (event) => {
					if (event.data.signed === true) {
						console.log(`Channel ${channelId} claim signed`);
					}
				});

				console.log('Subscription URL:', subscription?.created.next.always);

				if (subscription?.created.refs.qr_png) {
					window.open(subscription.created.next.always, '_blank');
				}

				await subscription?.resolved;
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

					<div className="rounded-lg bg-white/10 p-6">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="font-bold text-xl">受信Payment Channels</h3>
							<button
								type="button"
								onClick={handleBatchClose}
								disabled={isClosing || !channels || channels.length === 0}
								className="rounded bg-green-600 px-6 py-2 font-semibold transition hover:bg-green-700 disabled:opacity-50"
							>
								{isClosing ? 'クローズ中...' : '一括クローズ'}
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
