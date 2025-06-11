'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';

export default function ProfilePage() {
	const router = useRouter();
	const [isEditing, setIsEditing] = useState(false);
	const [nickname, setNickname] = useState('');
	const [email, setEmail] = useState('');
	const [twitterHandle, setTwitterHandle] = useState('');
	const [facebookHandle, setFacebookHandle] = useState('');
	const [instagramHandle, setInstagramHandle] = useState('');

	const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

	const { data: profile, refetch } = api.user.getProfile.useQuery(undefined, {
		enabled: !!userId,
	});

	const { mutate: updateProfile, isPending: isUpdating } = api.user.updateProfile.useMutation({
		onSuccess: () => {
			setIsEditing(false);
			refetch();
		},
	});

	const { mutate: setEmailHash } = api.user.setEmail.useMutation({
		onSuccess: () => {
			refetch();
			setEmail('');
		},
	});

	useEffect(() => {
		if (!userId) {
			router.push('/auth/signin');
		}
	}, [userId, router]);

	useEffect(() => {
		if (profile) {
			setNickname(profile.nickname || '');
			setTwitterHandle(profile.twitterHandle || '');
			setFacebookHandle(profile.facebookHandle || '');
			setInstagramHandle(profile.instagramHandle || '');
		}
	}, [profile]);

	const handleUpdateProfile = () => {
		updateProfile({
			nickname: nickname || undefined,
			twitterHandle: twitterHandle || null,
			facebookHandle: facebookHandle || null,
			instagramHandle: instagramHandle || null,
		});
	};

	const handleSetEmail = (e: React.FormEvent) => {
		e.preventDefault();
		if (email) {
			setEmailHash({ email });
		}
	};

	const getGravatarUrl = (emailHash: string) => {
		return `https://www.gravatar.com/avatar/${emailHash}?s=200&d=mp`;
	};

	if (!profile) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<p>Loading...</p>
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container mx-auto px-4 py-8">
				<div className="mx-auto max-w-2xl">
					<h1 className="mb-8 font-bold text-3xl">プロフィール設定</h1>

					<div className="mb-6 rounded-lg bg-white/10 p-6">
						<div className="mb-6 flex items-start gap-6">
							<div className="flex-shrink-0">
								{profile.emailHash ? (
									<Image
										src={getGravatarUrl(profile.emailHash)}
										alt="Avatar"
										width={100}
										height={100}
										className="rounded-full"
									/>
								) : (
									<div className="flex h-[100px] w-[100px] items-center justify-center rounded-full bg-gray-600">
										<span className="font-bold text-2xl">
											{profile.nickname?.[0] || profile.walletAddress[0]}
										</span>
									</div>
								)}
							</div>

							<div className="flex-1">
								<p className="mb-2 text-gray-400 text-sm">ウォレットアドレス</p>
								<p className="mb-4 font-mono text-sm">{profile.walletAddress}</p>

								{!profile.emailHash && (
									<form onSubmit={handleSetEmail} className="flex gap-2">
										<input
											type="email"
											value={email}
											onChange={(e) => setEmail(e.target.value)}
											placeholder="Gravatar用メールアドレス"
											className="flex-1 rounded bg-gray-700 px-3 py-2 text-sm"
										/>
										<button
											type="submit"
											className="rounded bg-blue-600 px-4 py-2 font-semibold text-sm transition hover:bg-blue-700"
										>
											設定
										</button>
									</form>
								)}
							</div>
						</div>

						{isEditing ? (
							<div className="space-y-4">
								<div>
									<label className="mb-1 block font-medium text-sm">ニックネーム</label>
									<input
										type="text"
										value={nickname}
										onChange={(e) => setNickname(e.target.value)}
										className="w-full rounded bg-gray-700 px-3 py-2"
										maxLength={50}
									/>
								</div>

								<div>
									<label className="mb-1 block font-medium text-sm">Twitter</label>
									<div className="flex items-center">
										<span className="mr-2 text-gray-400">@</span>
										<input
											type="text"
											value={twitterHandle}
											onChange={(e) =>
												setTwitterHandle(e.target.value.replace(/[^A-Za-z0-9_]/g, ''))
											}
											className="flex-1 rounded bg-gray-700 px-3 py-2"
											maxLength={15}
										/>
									</div>
								</div>

								<div>
									<label className="mb-1 block font-medium text-sm">Facebook</label>
									<input
										type="text"
										value={facebookHandle}
										onChange={(e) => setFacebookHandle(e.target.value)}
										className="w-full rounded bg-gray-700 px-3 py-2"
										maxLength={50}
									/>
								</div>

								<div>
									<label className="mb-1 block font-medium text-sm">Instagram</label>
									<div className="flex items-center">
										<span className="mr-2 text-gray-400">@</span>
										<input
											type="text"
											value={instagramHandle}
											onChange={(e) =>
												setInstagramHandle(e.target.value.replace(/[^A-Za-z0-9._]/g, ''))
											}
											className="flex-1 rounded bg-gray-700 px-3 py-2"
											maxLength={30}
										/>
									</div>
								</div>

								<div className="flex gap-2 pt-4">
									<button
										onClick={handleUpdateProfile}
										disabled={isUpdating}
										className="flex-1 rounded bg-blue-600 px-4 py-2 font-semibold transition hover:bg-blue-700 disabled:opacity-50"
									>
										{isUpdating ? '保存中...' : '保存'}
									</button>
									<button
										onClick={() => setIsEditing(false)}
										className="flex-1 rounded bg-gray-600 px-4 py-2 font-semibold transition hover:bg-gray-700"
									>
										キャンセル
									</button>
								</div>
							</div>
						) : (
							<div>
								<div className="mb-6 space-y-3">
									<div>
										<p className="text-gray-400 text-sm">ニックネーム</p>
										<p>{profile.nickname || '未設定'}</p>
									</div>

									{profile.twitterHandle && (
										<div>
											<p className="text-gray-400 text-sm">Twitter</p>
											<p>@{profile.twitterHandle}</p>
										</div>
									)}

									{profile.facebookHandle && (
										<div>
											<p className="text-gray-400 text-sm">Facebook</p>
											<p>{profile.facebookHandle}</p>
										</div>
									)}

									{profile.instagramHandle && (
										<div>
											<p className="text-gray-400 text-sm">Instagram</p>
											<p>@{profile.instagramHandle}</p>
										</div>
									)}
								</div>

								<button
									onClick={() => setIsEditing(true)}
									className="rounded bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700"
								>
									編集
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
		</main>
	);
}
