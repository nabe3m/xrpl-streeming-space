'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';
import { useIsMobile } from '~/hooks/useIsMobile';

export default function SignInPage() {
	const router = useRouter();
	const { isMobile } = useIsMobile();
	const [isLoading, setIsLoading] = useState(false);
	const [qrUrl, setQrUrl] = useState<string | null>(null);
	const [payloadUuid, setPayloadUuid] = useState<string | null>(null);
	const [deeplink, setDeeplink] = useState<string | null>(null);

	const { mutateAsync: createSignInPayload } = api.auth.createSignInPayload.useMutation();
	const { mutateAsync: verifySignIn } = api.auth.verifySignIn.useMutation();

	// すでにログインしている場合はリダイレクト
	useEffect(() => {
		if (typeof window !== 'undefined') {
			const userId = localStorage.getItem('userId');
			if (userId) {
				router.push('/rooms');
			}
		}
	}, [router]);

	const initiateSignIn = async () => {
		try {
			setIsLoading(true);
			const payload = await createSignInPayload();

			if (payload.uuid) {
				setPayloadUuid(payload.uuid);
				
				if (payload.qrUrl) {
					setQrUrl(payload.qrUrl);
				}
				
				if (payload.deeplink) {
					setDeeplink(payload.deeplink);
					// On mobile, automatically open the deeplink
					if (isMobile) {
						// 少し遅延を入れてからリダイレクト（UXの向上）
						setTimeout(() => {
							window.location.href = payload.deeplink;
						}, 100);
					}
				}
			}
		} catch (error) {
			console.error('Failed to create sign-in payload:', error);
			setIsLoading(false);
		}
	};

	useEffect(() => {
		if (!payloadUuid) return;

		const checkInterval = setInterval(async () => {
			try {
				console.log('Checking sign-in status for UUID:', payloadUuid);
				const result = await verifySignIn({ uuid: payloadUuid });

				if (result.user) {
					localStorage.setItem('user', JSON.stringify(result.user));
					localStorage.setItem('userId', result.user.id);
					// カスタムイベントを発火してヘッダーを更新
					window.dispatchEvent(new Event('authChange'));
					clearInterval(checkInterval);
					router.push('/rooms');
				}
			} catch (error) {
				console.error('Error checking sign-in status:', error);
				// TRPCエラーの詳細を表示
				if (error && typeof error === 'object' && 'message' in error) {
					console.error('Error message:', error.message);
				}
			}
		}, 2000);

		const timeout = setTimeout(() => {
			clearInterval(checkInterval);
			setIsLoading(false);
			setQrUrl(null);
			setPayloadUuid(null);
		}, 300000);

		return () => {
			clearInterval(checkInterval);
			clearTimeout(timeout);
		};
	}, [payloadUuid, verifySignIn, router]);

	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container flex max-w-md flex-col items-center justify-center gap-8 px-4 py-16">
				<h1 className="font-bold text-3xl">Xamanウォレットでログイン</h1>

				{!qrUrl ? (
					<>
						<p className="text-center text-gray-300">
							Xamanウォレットを使用してログインします。
							ウォレットをお持ちでない場合は、先にXamanアプリをインストールしてください。
						</p>

						<button
							onClick={initiateSignIn}
							disabled={isLoading}
							className="rounded-full bg-blue-600 px-8 py-3 font-semibold transition hover:bg-blue-700 disabled:opacity-50"
						>
							{isLoading ? 'Loading...' : 'ログインを開始'}
						</button>
					</>
				) : (
					<>
						{isMobile ? (
							// Mobile view: Show button to open Xaman app
							<>
								<p className="text-center text-gray-300">
									Xamanアプリで認証を完了してください
								</p>

								{deeplink && (
									<>
										<button
											onClick={() => {
												// 複数の方法でアプリを開くことを試みる
												const link = document.createElement('a');
												link.href = deeplink;
												link.click();
												
												// フォールバック
												setTimeout(() => {
													window.location.href = deeplink;
												}, 100);
											}}
											className="rounded-full bg-green-600 px-8 py-3 font-semibold transition hover:bg-green-700"
										>
											Xamanアプリを開く
										</button>
										
										{/* 手動でコピーできるようにリンクも表示 */}
										<p className="text-center text-gray-500 text-xs mt-2">
											または、
											<a 
												href={deeplink} 
												className="text-blue-400 underline"
												target="_blank"
												rel="noopener noreferrer"
											>
												こちらをタップ
											</a>
										</p>
									</>
								)}

								<p className="text-center text-gray-400 text-sm">
									アプリが開かない場合は、Xamanアプリを手動で開いて承認してください
								</p>
							</>
						) : (
							// Desktop view: Show QR code
							<>
								<p className="text-center text-gray-300">
									以下のQRコードをXamanアプリでスキャンしてください
								</p>

								<div className="rounded-lg bg-white p-4">
									{qrUrl && <Image src={qrUrl} alt="Sign in QR code" width={200} height={200} />}
								</div>

								<p className="text-center text-gray-400 text-sm">サインインを待っています...</p>
							</>
						)}
					</>
				)}
			</div>
		</main>
	);
}
