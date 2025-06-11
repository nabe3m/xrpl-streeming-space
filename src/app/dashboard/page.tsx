'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';

export default function DashboardPage() {
	const router = useRouter();
	const [activeTab, setActiveTab] = useState<'hosted' | 'participated' | 'nfts'>('hosted');

	const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

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

	useEffect(() => {
		if (!userId) {
			router.push('/auth/signin');
		}
	}, [userId, router]);

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

	return (
		<main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container mx-auto px-4 py-8">
				<div className="mb-8 flex items-center justify-between">
					<h1 className="font-bold text-3xl">ダッシュボード</h1>
					<Link
						href="/profile"
						className="rounded-full bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700"
					>
						プロフィール設定
					</Link>
				</div>

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
					<button
						onClick={() => setActiveTab('nfts')}
						className={`rounded-full px-6 py-2 font-semibold transition ${
							activeTab === 'nfts'
								? 'bg-blue-600 hover:bg-blue-700'
								: 'bg-white/10 hover:bg-white/20'
						}`}
					>
						発行したNFT
					</button>
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
											<Link
												href={`/rooms/${room.id}`}
												className="rounded bg-blue-600 px-4 py-2 font-semibold text-sm transition hover:bg-blue-700"
											>
												詳細
											</Link>
											{room.status === 'ENDED' && room._count.participants > 0 && (
												<>
													<Link
														href={`/dashboard/rooms/${room.id}/payment-channels`}
														className="rounded bg-purple-600 px-4 py-2 font-semibold text-sm transition hover:bg-purple-700"
													>
														支払い管理
													</Link>
													<Link
														href={`/dashboard/rooms/${room.id}/nft`}
														className="rounded bg-green-600 px-4 py-2 font-semibold text-sm transition hover:bg-green-700"
													>
														NFT発行
													</Link>
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
									<p className="text-sm text-yellow-400">
										支払い金額: {participation.totalPaidXrp.toFixed(6)} XRP
									</p>
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
