import '~/styles/globals.css';

import type { Metadata } from 'next';
import { Geist } from 'next/font/google';

import { Header } from '~/components/Header';
import { AuthProvider } from '~/contexts/AuthContext';
import { TRPCReactProvider } from '~/trpc/react';

export const metadata: Metadata = {
	title: 'XRP Spaces',
	description: 'XRPLベースの音声配信プラットフォーム',
	icons: [{ rel: 'icon', url: '/favicon.ico' }],
};

const geist = Geist({
	subsets: ['latin'],
	variable: '--font-geist-sans',
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="ja" className={`${geist.variable}`}>
			<body>
				<TRPCReactProvider>
					<AuthProvider>
						<Header />
						{children}
					</AuthProvider>
				</TRPCReactProvider>
			</body>
		</html>
	);
}
