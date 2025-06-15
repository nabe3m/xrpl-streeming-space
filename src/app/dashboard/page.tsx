'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { dropsToXrp } from 'xrpl';
import { api } from '~/trpc/react';

export default function DashboardPage() {
	const router = useRouter();
	const [activeTab, setActiveTab] = useState<'hosted' | 'participated' | 'nfts'>('hosted');
	const [userId, setUserId] = useState<string | null>(null);
	const [isCheckingAuth, setIsCheckingAuth] = useState(true);

	const { data: hostedRooms } = api.user.getRoomHistory.useQuery(
		{ limit: 20 },
		{ enabled: !!userId && activeTab === 'hosted' },
	);

	const { data: participations } = api.user.getParticipationHistory.useQuery(
		{ limit: 20 },
		{ enabled: !!userId && activeTab === 'participated' },
	);

	const { data: nfts } = api.user.getMintedNFTs.useQuery(undefined, {
		enabled: !!userId && activeTab === 'nfts',
	});

	// Check for claimable payments
	const { data: claimableChannels } = api.paymentChannel.getAllReceivedChannels.useQuery(undefined, {
		enabled: !!userId,
	});

	const claimableAmount = claimableChannels?.reduce((sum, channel) => {
		if (channel.lastAmount) {
			return sum + Number(dropsToXrp(channel.lastAmount));
		}
		return sum;
	}, 0) || 0;

	// Check authentication on client side
	useEffect(() => {
		const storedUserId = localStorage.getItem('userId');
		setUserId(storedUserId);
		setIsCheckingAuth(false);
		
		if (!storedUserId) {
			router.push('/auth/signin');
		}
	}, [router]);

	const formatDate = (date: Date) => {
		return new Date(date).toLocaleDateString('ja-JP', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
		});
	};

	const formatDuration = (seconds: number) => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;

		if (hours > 0) {
			return `${hours}時間${minutes}分`;
		} else if (minutes > 0) {
			return `${minutes}分${secs}秒`;
		} else {
			return `${secs}秒`;
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

	return (
		<main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8 flex items-center justify-between">
					<h1 className="font-bold text-3xl">ダッシュボード</h1>
					<div className="flex gap-2">
						<Link
							href="/dashboard/payment-claims"
							className="rounded-full bg-purple-600 px-6 py-2 font-semibold transition hover:bg-purple-700"
						>
							Payment Claims
						</Link>
						<Link
							href="/profile"
							className="rounded-full bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700"
						>
							プロフィール設定
						</Link>
					</div>
				</div>

				{claimableAmount > 0 && (
					<div className="mb-6 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="font-semibold">クレーム可能な支払いがあります</p>
								<p className="text-sm opacity-90">
									合計: {claimableAmount.toFixed(6)} XRP ({claimableChannels?.filter(ch => ch.lastAmount).length || 0} チャネル)
								</p>
							</div>
							<Link
								href="/dashboard/payment-claims"
								className="rounded bg-white px-4 py-2 font-semibold text-purple-700 transition hover:bg-gray-100"
							>
								クレームする →
							</Link>
						</div>
					</div>
				)}

				<div className="mb-6 flex gap-4">
					<button
						onClick={() => setActiveTab('hosted')}
						className={`rounded-full px-6 py-2 font-semibold transition ${
							activeTab === 'hosted'
								? 'bg-blue-600 hover:bg-blue-700'
								: 'bg-white/10 hover:bg-white/20'
						}`}
					>
						主催したルーム
					</button>
					<button
						onClick={() => setActiveTab('participated')}
						className={`rounded-full px-6 py-2 font-semibold transition ${
							activeTab === 'participated'
								? 'bg-blue-600 hover:bg-blue-700'
								: 'bg-white/10 hover:bg-white/20'
						}`}
					>
						参加したルーム
					</button>
					{/* <button
						onClick={() => setActiveTab('nfts')}
						className={`rounded-full px-6 py-2 font-semibold transition ${
							activeTab === 'nfts'
								? 'bg-blue-600 hover:bg-blue-700'
								: 'bg-white/10 hover:bg-white/20'
						}`}
					>
						発行したNFT
					</button> */}
				</div>

				<div className="rounded-lg bg-white/10 p-6">
					{activeTab === 'hosted' && (
						<div className="space-y-4">
							{hostedRooms?.items.map((room) => (
								<div key={room.id} className="rounded-lg bg-white/5 p-4">
									<div className="flex items-start justify-between">
										<div>
											<h3 className="mb-2 font-semibold text-lg">{room.title}</h3>
											{room.description && (
												<p className="mb-2 text-gray-300 text-sm">{room.description}</p>
											)}
											<p className="text-gray-400 text-sm">作成日: {formatDate(room.createdAt)}</p>
											<p className="text-gray-400 text-sm">
												参加者数: {room._count.participants}人
											</p>
											<p className="text-gray-400 text-sm">
												ステータス:{' '}
												{room.status === 'LIVE'
													? '配信中'
													: room.status === 'WAITING'
														? '開始前'
														: '終了'}
											</p>
										</div>
										<div className="flex gap-2">
											{room.status !== 'ENDED' && (
												<Link
													href={`/rooms/${room.id}`}
													className="rounded bg-blue-600 px-4 py-2 font-semibold text-sm transition hover:bg-blue-700"
												>
													ルームへ
												</Link>
											)}
											{room.status === 'ENDED' && room._count.participants > 0 && (
												<>
													{/* <Link
														href={`/dashboard/rooms/${room.id}/payment-channels`}
														className="rounded bg-purple-600 px-4 py-2 font-semibold text-sm transition hover:bg-purple-700"
													>
														支払い管理
													</Link> */}
													{/* <Link
														href={`/dashboard/rooms/${room.id}/nft`}
														className="rounded bg-green-600 px-4 py-2 font-semibold text-sm transition hover:bg-green-700"
													>
														NFT発行
													</Link> */}
												</>
											)}
										</div>
									</div>
								</div>
							))}
							{hostedRooms?.items.length === 0 && (
								<p className="text-center text-gray-400">主催したルームはありません</p>
							)}
						</div>
					)}

					{activeTab === 'participated' && (
						<div className="space-y-4">
							{participations?.items.map((participation) => (
								<div key={participation.id} className="rounded-lg bg-white/5 p-4">
									<div className="flex items-start justify-between">
										<div>
											<h3 className="mb-2 font-semibold text-lg">{participation.room.title}</h3>
											<p className="text-gray-400 text-sm">
												ホスト:{' '}
												{participation.room.creator.nickname ||
													participation.room.creator.walletAddress.slice(0, 8)}
												...
											</p>
											<p className="text-gray-400 text-sm">
												参加日: {formatDate(participation.joinedAt)}
											</p>
											<p className="text-gray-400 text-sm">
												滞在時間: {formatDuration(participation.totalTimeSeconds)}
											</p>
										</div>
										{participation.room.status === 'LIVE' && (
											<Link href={`/rooms/${participation.room.id}`} className="rounded bg-blue-600 px-4 py-2 font-semibold text-sm transition hover:bg-blue-700">
												ルームへ
											</Link>
										)}
									</div>
								</div>
							))}
							{participations?.items.length === 0 && (
								<p className="text-center text-gray-400">参加したルームはありません</p>
							)}
						</div>
					)}

					{activeTab === 'nfts' && (
						<div className="space-y-4">
							{nfts?.map((nft) => (
								<div key={nft.id} className="rounded-lg bg-white/5 p-4">
									<h3 className="mb-2 font-semibold text-lg">{nft.title}</h3>
									{nft.description && (
										<p className="mb-2 text-gray-300 text-sm">{nft.description}</p>
									)}
									<p className="text-gray-400 text-sm">Token ID: {nft.tokenId.slice(0, 16)}...</p>
									<p className="text-gray-400 text-sm">発行日: {formatDate(nft.createdAt)}</p>
									<div className="mt-2">
										<a
											href={`https://testnet.xrpl.org/nft/${nft.tokenId}`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-blue-400 text-sm hover:text-blue-300"
										>
											XRPLエクスプローラで確認 →
										</a>
									</div>
								</div>
							))}
							{nfts?.length === 0 && (
								<p className="text-center text-gray-400">発行したNFTはありません</p>
							)}
						</div>
					)}
				</div>
			</div>
		</main>
	);
}
