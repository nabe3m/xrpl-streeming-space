'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function Home() {
	const [userId, setUserId] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			const storedUserId = localStorage.getItem('userId');
			setUserId(storedUserId);
		}
	}, []);

	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
				<h1 className="font-extrabold text-5xl tracking-tight sm:text-[5rem]">
					XRPL <span className="text-[hsl(200,100%,70%)]">Clubhouse</span>
				</h1>
				<p className="text-gray-300 text-xl">XRPLベースの音声配信プラットフォーム</p>
				<div className="flex gap-4">
					{userId ? (
						<>
							<Link
								className="rounded-full bg-blue-600 px-8 py-3 font-semibold transition hover:bg-blue-700"
								href="/rooms"
							>
								ルーム一覧へ
							</Link>
							<Link
								className="rounded-full bg-white/10 px-8 py-3 font-semibold transition hover:bg-white/20"
								href="/profile"
							>
								プロフィール
							</Link>
						</>
					) : (
						<Link
							className="rounded-full bg-blue-600 px-8 py-3 font-semibold transition hover:bg-blue-700"
							href="/auth/signin"
						>
							ウォレットでログイン
						</Link>
					)}
				</div>
				<div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-8">
					<div className="flex flex-col gap-2 rounded-xl bg-white/10 p-6">
						<h3 className="font-bold text-xl">🎙️ 音声配信</h3>
						<p className="text-gray-300">高品質な音声配信を簡単に開始できます</p>
					</div>
					<div className="flex flex-col gap-2 rounded-xl bg-white/10 p-6">
						<h3 className="font-bold text-xl">💰 マイクロペイメント</h3>
						<p className="text-gray-300">XRPLのペイメントチャネルで秒単位の課金</p>
					</div>
					<div className="flex flex-col gap-2 rounded-xl bg-white/10 p-6">
						<h3 className="font-bold text-xl">🎫 NFTゲート</h3>
						<p className="text-gray-300">NFT保有者限定のルームを作成可能</p>
					</div>
				</div>
			</div>
		</main>
	);
}
