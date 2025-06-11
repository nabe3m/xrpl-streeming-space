'use client';

import Image from 'next/image';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';

export default function NFTMintPage() {
	const params = useParams();
	const router = useRouter();
	const roomId = params.roomId as string;

	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [imageUrl, setImageUrl] = useState('');
	const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
	const [isSelectAll, setIsSelectAll] = useState(true);

	const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

	const { data: room, isLoading } = api.room.get.useQuery({ id: roomId });

	const { mutate: prepareMint, isPending } = api.nft.prepareMint.useMutation({
		onSuccess: (data) => {
			alert(
				`${data.payloads.length}個のNFTミントトランザクションを作成しました。Xamanアプリで署名してください。`,
			);
			router.push('/dashboard');
		},
		onError: (error) => {
			alert(`エラー: ${error.message}`);
		},
	});

	useEffect(() => {
		if (!userId) {
			router.push('/auth/signin');
			return;
		}

		if (room && room.creatorId !== userId) {
			router.push('/dashboard');
		}
	}, [userId, room, router]);

	useEffect(() => {
		if (room) {
			setTitle(`${room.title} 参加記念NFT`);
			setDescription(`${room.title}への参加を記念するNFTです`);
		}
	}, [room]);

	const handleToggleParticipant = (participantId: string) => {
		setSelectedParticipants((prev) =>
			prev.includes(participantId)
				? prev.filter((id) => id !== participantId)
				: [...prev, participantId],
		);
	};

	const handleSelectAll = () => {
		if (isSelectAll) {
			setSelectedParticipants([]);
		} else {
			const allParticipants =
				room?.participants.filter((p) => p.userId !== userId).map((p) => p.userId) || [];
			setSelectedParticipants(allParticipants);
		}
		setIsSelectAll(!isSelectAll);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (selectedParticipants.length === 0) {
			alert('NFTを発行する参加者を選択してください');
			return;
		}

		if (!imageUrl) {
			alert('画像URLを入力してください');
			return;
		}

		const recipientAddresses =
			room?.participants
				.filter((p) => selectedParticipants.includes(p.userId))
				.map((p) => p.user.walletAddress) || [];

		prepareMint({
			roomId,
			title,
			description,
			imageUrl,
			recipientAddresses,
		});
	};

	if (isLoading) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<p>Loading...</p>
			</main>
		);
	}

	if (!room) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<p>ルームが見つかりません</p>
			</main>
		);
	}

	const eligibleParticipants = room.participants.filter((p) => p.userId !== userId);

	return (
		<main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container mx-auto px-4 py-8">
				<div className="mx-auto max-w-4xl">
					<h1 className="mb-8 font-bold text-3xl">NFT発行</h1>

					<div className="mb-6 rounded-lg bg-white/10 p-6">
						<h2 className="mb-4 font-semibold text-xl">{room.title}</h2>
						<p className="text-gray-300">このルームの参加者にNFTを発行します</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-6">
						<div className="rounded-lg bg-white/10 p-6">
							<h3 className="mb-4 font-semibold text-lg">NFT情報</h3>

							<div className="space-y-4">
								<div>
									<label className="mb-1 block font-medium text-sm">タイトル</label>
									<input
										type="text"
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										className="w-full rounded bg-gray-700 px-3 py-2"
										required
									/>
								</div>

								<div>
									<label className="mb-1 block font-medium text-sm">説明</label>
									<textarea
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										className="w-full rounded bg-gray-700 px-3 py-2"
										rows={3}
									/>
								</div>

								<div>
									<label className="mb-1 block font-medium text-sm">画像URL</label>
									<input
										type="url"
										value={imageUrl}
										onChange={(e) => setImageUrl(e.target.value)}
										className="w-full rounded bg-gray-700 px-3 py-2"
										placeholder="https://example.com/image.png"
										required
									/>
									<p className="mt-1 text-gray-400 text-xs">
										IPFSまたは公開されている画像URLを指定してください
									</p>
								</div>

								{imageUrl && (
									<div className="mt-4">
										<p className="mb-2 font-medium text-sm">プレビュー</p>
										<div className="relative h-48 w-48 overflow-hidden rounded bg-gray-700">
											<Image
												src={imageUrl}
												alt="NFT preview"
												fill
												className="object-cover"
												onError={(e) => {
													e.currentTarget.src = '/placeholder.png';
												}}
											/>
										</div>
									</div>
								)}
							</div>
						</div>

						<div className="rounded-lg bg-white/10 p-6">
							<div className="mb-4 flex items-center justify-between">
								<h3 className="font-semibold text-lg">発行対象者</h3>
								<button
									type="button"
									onClick={handleSelectAll}
									className="text-blue-400 text-sm hover:text-blue-300"
								>
									{isSelectAll ? '全選択解除' : '全選択'}
								</button>
							</div>

							{eligibleParticipants.length === 0 ? (
								<p className="text-gray-400">NFTを発行できる参加者がいません</p>
							) : (
								<div className="space-y-2">
									{eligibleParticipants.map((participant) => (
										<label
											key={participant.id}
											className="flex cursor-pointer items-center gap-3 rounded bg-white/5 p-3 hover:bg-white/10"
										>
											<input
												type="checkbox"
												checked={selectedParticipants.includes(participant.userId)}
												onChange={() => handleToggleParticipant(participant.userId)}
												className="rounded"
											/>
											<div>
												<p className="font-medium">
													{participant.user.nickname || participant.user.walletAddress.slice(0, 8)}
													...
												</p>
												<p className="text-gray-400 text-sm">{participant.user.walletAddress}</p>
											</div>
										</label>
									))}
								</div>
							)}
						</div>

						<div className="flex gap-4">
							<button
								type="submit"
								disabled={isPending || selectedParticipants.length === 0}
								className="flex-1 rounded bg-green-600 px-6 py-3 font-semibold transition hover:bg-green-700 disabled:opacity-50"
							>
								{isPending
									? 'トランザクション作成中...'
									: `${selectedParticipants.length}人にNFTを発行`}
							</button>
							<button
								type="button"
								onClick={() => router.push('/dashboard')}
								className="flex-1 rounded bg-gray-600 px-6 py-3 font-semibold transition hover:bg-gray-700"
							>
								キャンセル
							</button>
						</div>
					</form>
				</div>
			</div>
		</main>
	);
}
