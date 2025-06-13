'use client';

import { useState } from 'react';
import { Xumm } from 'xumm';
import { env } from '~/env';

export default function TestXummPage() {
	const [isLoading, setIsLoading] = useState(false);
	const [result, setResult] = useState<any>(null);

	const testXumm = async () => {
		try {
			setIsLoading(true);
			console.log('Testing Xumm...');
			console.log('API Key:', env.NEXT_PUBLIC_XUMM_API_KEY?.slice(0, 8) + '...');

			const xumm = new Xumm(env.NEXT_PUBLIC_XUMM_API_KEY);
			console.log('Xumm instance:', xumm);
			console.log('Xumm payload?', !!xumm.payload);

			// Simple test transaction
			const testTx = {
				TransactionType: 'Payment' as const,
				Account: 'rwietsevLFg8XSmG3bEZzFein1g8RBqWDZ',
				Destination: 'rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY',
				Amount: '1000000', // 1 XRP
			};

			console.log('Creating payload...');
			const payload = await xumm.payload?.create(testTx);
			console.log('Payload created:', payload);

			if (payload?.next?.always) {
				window.open(payload.next.always, '_blank');
			}

			setResult(payload);
		} catch (error) {
			console.error('Xumm test error:', error);
			setResult({ error: error?.toString() });
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			<div className="container mx-auto px-4 py-8">
				<div className="mx-auto max-w-4xl">
					<h1 className="mb-8 font-bold text-3xl">Xumm Test</h1>

					<div className="mb-6 rounded-lg bg-white/10 p-6">
						<button
							type="button"
							onClick={testXumm}
							disabled={isLoading}
							className="rounded bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700 disabled:opacity-50"
						>
							{isLoading ? 'Testing...' : 'Test Xumm'}
						</button>
					</div>

					{result && (
						<div className="rounded-lg bg-white/10 p-6">
							<pre className="overflow-auto text-xs">{JSON.stringify(result, null, 2)}</pre>
						</div>
					)}
				</div>
			</div>
		</main>
	);
}
