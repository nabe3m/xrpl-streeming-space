'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function HeaderNav() {
	const router = useRouter();
	const [userId, setUserId] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		const storedUserId = localStorage.getItem('userId');
		setUserId(storedUserId);
	}, []);

	const handleLogout = () => {
		localStorage.removeItem('userId');
		localStorage.removeItem('walletAddress');
		router.push('/');
	};

	// マウント前は何も表示しない
	if (!mounted) {
		return <div className="h-10 w-40"></div>;
	}

	return (
		<div className="flex items-center gap-6">
			{userId ? (
				<>
					<Link href="/rooms" className="transition hover:text-blue-400">
						ルーム一覧
					</Link>
					<Link href="/profile" className="transition hover:text-blue-400">
						プロフィール
					</Link>
					<button
						type="button"
						onClick={handleLogout}
						className="rounded-full bg-red-600 px-4 py-2 font-semibold text-sm text-white transition hover:bg-red-700"
					>
						ログアウト
					</button>
				</>
			) : (
				<Link
					href="/auth/signin"
					className="rounded-full bg-blue-600 px-4 py-2 font-semibold text-sm text-white transition hover:bg-blue-700"
				>
					ログイン
				</Link>
			)}
		</div>
	);
}
