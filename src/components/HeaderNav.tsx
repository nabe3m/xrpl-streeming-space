'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useIsMobile } from '~/hooks/useIsMobile';

export function HeaderNav() {
	const router = useRouter();
	const isMobile = useIsMobile();
	const [userId, setUserId] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
		setMobileMenuOpen(false);
		// カスタムイベントを発火して他のコンポーネントに通知
		window.dispatchEvent(new Event('authChange'));
		router.push('/');
	};

	// マウント前は何も表示しない
	if (!mounted) {
		return <div className="h-10 w-40"></div>;
	}

	// Mobile menu
	if (isMobile) {
		return (
			<div className="relative">
				{/* Menu button */}
				<button
					onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
					className="flex items-center gap-1.5 px-3 py-1.5 text-black bg-white rounded-lg hover:bg-gray-100 transition-colors"
					aria-label="メニュー"
				>
					<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
					</svg>
					<span className="text-sm font-medium">Menu</span>
				</button>

				{/* Dropdown menu */}
				{mobileMenuOpen && (
					<>
						{/* Overlay */}
						<div 
							className="fixed inset-0 z-30" 
							onClick={() => setMobileMenuOpen(false)} 
						/>
						
						{/* Dropdown panel */}
						<div className="absolute right-0 mt-2 w-48 bg-[#2a2b4a] rounded-lg shadow-xl z-40 overflow-hidden">
							{userId ? (
								<>
									<Link 
										href="/dashboard" 
										className="block px-4 py-3 text-white hover:bg-white/10 transition-colors"
										onClick={() => setMobileMenuOpen(false)}
									>
										ダッシュボード
									</Link>
									<Link 
										href="/rooms" 
										className="block px-4 py-3 text-white hover:bg-white/10 transition-colors"
										onClick={() => setMobileMenuOpen(false)}
									>
										ルーム一覧
									</Link>
									<Link 
										href="/profile" 
										className="block px-4 py-3 text-white hover:bg-white/10 transition-colors"
										onClick={() => setMobileMenuOpen(false)}
									>
										プロフィール
									</Link>
									<hr className="border-white/20" />
									<button
										type="button"
										onClick={handleLogout}
										className="block w-full text-left px-4 py-3 text-red-400 hover:bg-white/10 transition-colors"
									>
										ログアウト
									</button>
								</>
							) : (
								<Link
									href="/auth/signin"
									className="block px-4 py-3 text-white hover:bg-white/10 transition-colors"
									onClick={() => setMobileMenuOpen(false)}
								>
									ログイン
								</Link>
							)}
						</div>
					</>
				)}
			</div>
		);
	}

	// Desktop menu
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
