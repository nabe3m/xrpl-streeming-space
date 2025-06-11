'use client';

import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { api } from '~/trpc/react';

interface User {
	id: string;
	walletAddress: string;
	nickname?: string | null;
	avatarUrl?: string | null;
}

interface AuthContextType {
	user: User | null;
	isLoading: boolean;
	signIn: () => Promise<void>;
	signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const { mutateAsync: createSignInPayload } = api.auth.createSignInPayload.useMutation();
	const { mutateAsync: verifySignIn } = api.auth.verifySignIn.useMutation();

	useEffect(() => {
		const storedUser = localStorage.getItem('user');
		if (storedUser) {
			setUser(JSON.parse(storedUser));
		}
		setIsLoading(false);
	}, []);

	const signIn = async () => {
		try {
			const payload = await createSignInPayload();

			if (!payload.uuid || !payload.qrUrl) {
				throw new Error('Failed to create sign-in payload');
			}

			window.open(payload.deeplink || payload.qrUrl, '_blank');

			const checkInterval = setInterval(async () => {
				try {
					const result = await verifySignIn({ uuid: payload.uuid! });

					if (result.user) {
						setUser(result.user);
						localStorage.setItem('user', JSON.stringify(result.user));
						clearInterval(checkInterval);
					}
				} catch (error) {
					console.error('Error checking sign-in status:', error);
				}
			}, 2000);

			setTimeout(() => {
				clearInterval(checkInterval);
			}, 300000);
		} catch (error) {
			console.error('Sign-in error:', error);
			throw error;
		}
	};

	const signOut = () => {
		setUser(null);
		localStorage.removeItem('user');
	};

	return (
		<AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
}
