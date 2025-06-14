'use client';

import Link from 'next/link';
import { HeaderNav } from './HeaderNav';
import { useScrolled } from '~/hooks/useScrolled';

export function Header() {
	const isScrolled = useScrolled();

	return (
		<header className={`border-b sticky top-0 z-30 transition-all duration-300 ${
			isScrolled 
				? 'border-white/40 border-gray-200 shadow-sm backdrop-blur-md' 
				: 'border-white/40'
		}`}>
			<div className="container mx-auto px-4">
				<nav className="flex items-center justify-between py-4">
					<Link 
						href="/" 
						className={`font-bold text-lg md:text-xl transition-colors ${
							isScrolled ? 'text-white' : 'text-gray-900'
						}`}
					>
						XRP <span className='text-[hsl(200,100%,70%)]'>Spaces</span>
					</Link>
					<HeaderNav />
				</nav>
			</div>
		</header>
	);
}
