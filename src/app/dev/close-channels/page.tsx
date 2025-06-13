'use client';

import { useState } from 'react';
import { Client, PaymentChannelClaimFlags } from 'xrpl';
import { env } from '~/env';
import { api } from '~/trpc/react';

export default function CloseChannelsDevPage() {
	const [address, setAddress] = useState('');
	const [channels, setChannels] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isClosing, setIsClosing] = useState(false);
	const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
	const [fetchMode, setFetchMode] = useState<'source' | 'destination'>('source');

	const fetchChannels = async () => {
		if (!address) {
			alert('アドレスを入力してください');
			return;
		}

		try {
			setIsLoading(true);
			const client = new Client(env.NEXT_PUBLIC_XRPL_NETWORK);
			await client.connect();

			if (fetchMode === 'source') {
				// Get channels where this address is the source
				const response = await client.request({
					command: 'account_channels',
					account: address,
				});

				setChannels((response.result as any).channels || []);
				console.log('Channels (as source):', (response.result as any).channels);
			} else {
				// Get channels where this address is the destination
				// We need to use account_objects to find incoming channels
				const response = await client.request({
					command: 'account_objects',
					account: address,
					// type: 'check',
				});

				console.log(response);

				// Filter for PayChannel objects where we are the destination
				const allObjects = (response.result as any).account_objects || [];
				const incomingChannels = allObjects.filter(
					(obj: any) => obj.LedgerEntryType === 'PayChannel' && obj.Destination === address,
				);

				// Transform to match the channel format
				const transformedChannels = incomingChannels.map((ch: any) => ({
					channel_id: ch.index,
					account: ch.Account,
					destination_account: ch.Destination,
					amount: ch.Amount,
					balance: ch.Balance,
					public_key: ch.PublicKey,
					expiration: ch.Expiration,
				}));

				setChannels(transformedChannels);
				console.log('Channels (as destination):', transformedChannels);
			}

			await client.disconnect();
		} catch (error) {
			console.error('Failed to fetch channels:', error);
			alert('チャネルの取得に失敗しました');
		} finally {
			setIsLoading(false);
		}
	};

	const handleSelectAll = () => {
		if (selectedChannels.length === channels.length) {
			setSelectedChannels([]);
		} else {
			setSelectedChannels(channels.map((ch) => ch.channel_id));
		}
	};

	const handleToggleChannel = (channelId: string) => {
		setSelectedChannels((prev) =>
			prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId],
		);
	};

	const createPayloadMutation = api.xumm.createPaymentChannelClaimPayload.useMutation();
	const getPayloadResultMutation = api.xumm.getPayloadResult.useMutation();

	const closeSelectedChannels = async () => {
		if (selectedChannels.length === 0) {
			alert('クローズするチャネルを選択してください');
			return;
		}

		if (!confirm(`${selectedChannels.length}個のチャネルをクローズしますか？`)) {
			return;
		}

		try {
			setIsClosing(true);

			for (const channelId of selectedChannels) {
				const channel = channels.find((ch) => ch.channel_id === channelId);
				if (!channel) continue;

				console.log('Closing channel:', channelId);

				try {
					// サーバーサイドでXummペイロードを作成
					const payloadResponse = await createPayloadMutation.mutateAsync({
						account: address,
						channelId: channelId,
						flags: PaymentChannelClaimFlags.tfClose,
					});

					console.log('Created payload:', payloadResponse);

					// ユーザーに署名を求める
					if (payloadResponse.next?.always) {
						console.log('Opening Xumm URL:', payloadResponse.next.always);
						window.open(payloadResponse.next.always, '_blank');
					}

					// 署名完了を待つ
					console.log('Waiting for signature...');
					let signed = false;
					let attempts = 0;
					const maxAttempts = 60; // 1分待機

					while (!signed && attempts < maxAttempts) {
						await new Promise((resolve) => setTimeout(resolve, 1000));
						attempts++;

						try {
							const result = await getPayloadResultMutation.mutateAsync({
								uuid: payloadResponse.uuid,
							});

							if (result.meta?.signed) {
								signed = true;
								console.log(`Channel ${channelId} successfully signed`);
								break;
							}
						} catch (pollError) {
							console.warn('Error polling payload result:', pollError);
						}
					}

					if (!signed) {
						console.log('Transaction was not signed within timeout');
						continue; // Skip to next channel
					}
				} catch (xummError) {
					console.error('Xumm error:', xummError);
					alert(`チャネル ${channelId} のクローズに失敗しました: ${xummError}`);
					continue;
				}

				// 少し待機（レート制限対策）
				await new Promise((resolve) => setTimeout(resolve, 1000));
			}

			alert('選択したチャネルのクローズを完了しました');
			// チャネルリストを再取得
			await fetchChannels();
			setSelectedChannels([]);
		} catch (error) {
			console.error('Failed to close channels:', error);
			alert('チャネルのクローズに失敗しました');
		} finally {
			setIsClosing(false);
		}
	};

	return (
		<main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container mx-auto px-4 py-8">
				<div className="mx-auto max-w-4xl">
					<h1 className="mb-8 font-bold text-3xl">Payment Channels一括クローズ（開発用）</h1>

					<div className="mb-6 rounded-lg bg-white/10 p-6">
						<div className="mb-4">
							<label className="mb-2 block text-sm">取得モード</label>
							<div className="mb-4 flex gap-4">
								<label className="flex items-center">
									<input
										type="radio"
										value="source"
										checked={fetchMode === 'source'}
										onChange={(e) => setFetchMode(e.target.value as 'source')}
										className="mr-2"
									/>
									<span>送信元として（自分が作成したチャネル）</span>
								</label>
								<label className="flex items-center">
									<input
										type="radio"
										value="destination"
										checked={fetchMode === 'destination'}
										onChange={(e) => setFetchMode(e.target.value as 'destination')}
										className="mr-2"
									/>
									<span>受信先として（自分宛のチャネル）</span>
								</label>
							</div>
						</div>
						<div className="mb-4">
							<label className="mb-2 block text-sm">ウォレットアドレス</label>
							<input
								type="text"
								value={address}
								onChange={(e) => setAddress(e.target.value)}
								placeholder="r..."
								className="w-full rounded bg-gray-700 px-4 py-2 text-white"
							/>
						</div>
						<button
							type="button"
							onClick={fetchChannels}
							disabled={isLoading}
							className="rounded bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700 disabled:opacity-50"
						>
							{isLoading ? '読み込み中...' : 'チャネル一覧を取得'}
						</button>
					</div>

					{channels.length > 0 && (
						<div className="rounded-lg bg-white/10 p-6">
							<div className="mb-4 flex items-center justify-between">
								<h2 className="font-bold text-xl">
									{fetchMode === 'source' ? '送信' : '受信'}Payment Channels ({channels.length}個)
								</h2>
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
										onClick={closeSelectedChannels}
										disabled={isClosing || selectedChannels.length === 0}
										className="rounded bg-red-600 px-4 py-2 font-semibold text-sm transition hover:bg-red-700 disabled:opacity-50"
									>
										{isClosing
											? 'クローズ中...'
											: `選択したチャネルをクローズ (${selectedChannels.length})`}
									</button>
								</div>
							</div>

							<div className="space-y-2">
								{channels.map((channel) => (
									<div
										key={channel.channel_id}
										className={`cursor-pointer rounded-lg p-4 transition ${
											selectedChannels.includes(channel.channel_id)
												? 'border-2 border-blue-500 bg-blue-900/50'
												: 'border-2 border-transparent bg-white/5 hover:bg-white/10'
										}`}
										onClick={() => handleToggleChannel(channel.channel_id)}
									>
										<div className="flex items-start justify-between">
											<div className="flex-1">
												<p className="mb-1 font-mono text-sm">Channel ID: {channel.channel_id}</p>
												{fetchMode === 'source' ? (
													<p className="text-gray-400 text-sm">
														Destination: {channel.destination_account}
													</p>
												) : (
													<p className="text-gray-400 text-sm">Source: {channel.account}</p>
												)}
												<p className="text-gray-400 text-sm">
													Amount: {channel.amount} drops ({Number(channel.amount) / 1_000_000} XRP)
												</p>
												<p className="text-gray-400 text-sm">
													Balance: {channel.balance} drops ({Number(channel.balance) / 1_000_000}{' '}
													XRP)
												</p>
												{channel.expiration && (
													<p className="text-sm text-yellow-400">
														Expiration:{' '}
														{new Date(channel.expiration * 1000 + 946684800000).toLocaleString()}
													</p>
												)}
											</div>
											<div className="ml-4">
												<input
													type="checkbox"
													checked={selectedChannels.includes(channel.channel_id)}
													onChange={() => handleToggleChannel(channel.channel_id)}
													onClick={(e) => e.stopPropagation()}
													className="h-5 w-5"
												/>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{channels.length === 0 && address && !isLoading && (
						<div className="rounded-lg bg-white/10 p-6 text-center">
							<p className="text-gray-400">
								{fetchMode === 'source'
									? 'このアドレスが送信元のPayment Channelがありません'
									: 'このアドレスが受信先のPayment Channelがありません'}
							</p>
						</div>
					)}

					<div className="mt-8 rounded-lg bg-yellow-900/50 p-4">
						<p className="text-sm text-yellow-300">
							⚠️ 注意: これは開発用のツールです。本番環境では使用しないでください。
						</p>
						<p className="mt-2 text-sm text-yellow-300">
							- チャネルをクローズすると、残高は送信者に返金されます
						</p>
						<p className="text-sm text-yellow-300">
							- 受信者がクローズする場合は、事前にPaymentChannelClaimで残高を請求してください
						</p>
					</div>
				</div>
			</div>
		</main>
	);
}
