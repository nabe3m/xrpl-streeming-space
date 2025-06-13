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
		// 初回読み込み時にlocalStorageから取得
		const storedUserId = localStorage.getItem('userId');
		setUserId(storedUserId);

		// localStorageの変更を監視してリアクティブに更新
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === 'userId') {
				setUserId(e.newValue);
			}
		};

		// カスタムイベントを監視（同じウィンドウ内での変更用）
		const handleAuthChange = () => {
			const newUserId = localStorage.getItem('userId');
			setUserId(newUserId);
		};

		window.addEventListener('storage', handleStorageChange);
		window.addEventListener('authChange', handleAuthChange);

		return () => {
			window.removeEventListener('storage', handleStorageChange);
			window.removeEventListener('authChange', handleAuthChange);
		};
	}, []);

	const handleLogout = () => {
		localStorage.removeItem('userId');
		localStorage.removeItem('walletAddress');
		setUserId(null);
		// カスタムイベントを発火して他のコンポーネントに通知
		window.dispatchEvent(new Event('authChange'));
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
					<Link href="/dashboard" className="transition hover:text-blue-400">
						ダッシュボード
					</Link>
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
