'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';

export default function RoomsPage() {
	const router = useRouter();
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [xrpPerMinute, setXrpPerMinute] = useState(0.01);

	const { data: roomsData, refetch } = api.room.list.useQuery({
		status: 'LIVE',
	});

	const { data: waitingRoomsData } = api.room.list.useQuery({
		status: 'WAITING',
	});

	const { mutate: createRoom, isPending } = api.room.create.useMutation({
		onSuccess: (room) => {
			setShowCreateModal(false);
			refetch();
			router.push(`/rooms/${room.id}`);
		},
		onError: (error) => {
			alert(error.message);
		},
	});

	const [isLoading, setIsLoading] = useState(true);
	const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

	// ログインチェック
	useEffect(() => {
		if (typeof window !== 'undefined') {
			const storedUserId = localStorage.getItem('userId');
			if (!storedUserId) {
				router.push('/auth/signin');
			} else {
				setIsLoading(false);
			}
		}
	}, [router]);

	const handleCreateRoom = () => {
		if (!userId) {
			router.push('/auth/signin');
			return;
		}
		setShowCreateModal(true);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		createRoom({
			title,
			description,
			xrpPerMinute,
		});
	};

	// ローディング中の表示
	if (isLoading) {
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
					<h1 className="font-bold text-3xl">ルーム一覧</h1>
					<button
						onClick={handleCreateRoom}
						className="rounded-full bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700"
					>
						ルームを作成
					</button>
				</div>

				<div className="space-y-8">
					<section>
						<h2 className="mb-4 font-semibold text-xl">配信中</h2>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
							{roomsData?.items.map((room) => (
								<Link
									key={room.id}
									href={`/rooms/${room.id}`}
									className="block rounded-lg bg-white/10 p-6 transition hover:bg-white/20"
								>
									<h3 className="mb-2 font-semibold text-lg">{room.title}</h3>
									{room.description && (
										<p className="mb-2 text-gray-300 text-sm">{room.description}</p>
									)}
									<div className="flex items-center justify-between text-sm">
										<span className="text-gray-400">
											Host: {room.creator.nickname || room.creator.walletAddress.slice(0, 8)}...
										</span>
										<span className="text-green-400">{room._count.participants} 人参加中</span>
									</div>
									<div className="mt-2 text-sm text-yellow-400">{room.xrpPerMinute} XRP/分</div>
								</Link>
							))}
							{roomsData?.items.length === 0 && (
								<p className="text-gray-400">現在配信中のルームはありません</p>
							)}
						</div>
					</section>

					<section>
						<h2 className="mb-4 font-semibold text-xl">開始前</h2>
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
							{waitingRoomsData?.items.map((room) => (
								<Link
									key={room.id}
									href={`/rooms/${room.id}`}
									className="block rounded-lg bg-white/10 p-6 transition hover:bg-white/20"
								>
									<h3 className="mb-2 font-semibold text-lg">{room.title}</h3>
									{room.description && (
										<p className="mb-2 text-gray-300 text-sm">{room.description}</p>
									)}
									<div className="flex items-center justify-between text-sm">
										<span className="text-gray-400">
											Host: {room.creator.nickname || room.creator.walletAddress.slice(0, 8)}...
										</span>
										<span className="text-gray-400">{room._count.participants} 人待機中</span>
									</div>
									<div className="mt-2 text-sm text-yellow-400">{room.xrpPerMinute} XRP/分</div>
								</Link>
							))}
							{waitingRoomsData?.items.length === 0 && (
								<p className="text-gray-400">開始前のルームはありません</p>
							)}
						</div>
					</section>
				</div>
			</div>

			{showCreateModal && (
				<div className="fixed inset-0 flex items-center justify-center bg-black/50 p-4">
					<div className="w-full max-w-md rounded-lg bg-gray-800 p-6">
						<h2 className="mb-4 font-semibold text-xl">ルームを作成</h2>
						<form onSubmit={handleSubmit} className="space-y-4">
							<div>
								<label className="mb-1 block font-medium text-sm">タイトル</label>
								<input
									type="text"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									className="w-full rounded bg-gray-700 px-3 py-2 text-white"
									required
								/>
							</div>
							<div>
								<label className="mb-1 block font-medium text-sm">説明（任意）</label>
								<textarea
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									className="w-full rounded bg-gray-700 px-3 py-2 text-white"
									rows={3}
								/>
							</div>
							<div>
								<label className="mb-1 block font-medium text-sm">料金（XRP/分）</label>
								<input
									type="number"
									value={xrpPerMinute}
									onChange={(e) => setXrpPerMinute(Number.parseFloat(e.target.value))}
									className="w-full rounded bg-gray-700 px-3 py-2 text-white"
									min="0"
									step="0.001"
									required
								/>
							</div>
							<div className="flex gap-2 pt-4">
								<button
									type="submit"
									disabled={isPending}
									className="flex-1 rounded bg-blue-600 px-4 py-2 font-semibold transition hover:bg-blue-700 disabled:opacity-50"
								>
									{isPending ? '作成中...' : '作成'}
								</button>
								<button
									type="button"
									onClick={() => setShowCreateModal(false)}
									className="flex-1 rounded bg-gray-600 px-4 py-2 font-semibold transition hover:bg-gray-700"
								>
									キャンセル
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</main>
	);
}
