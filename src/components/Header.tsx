import Link from 'next/link';
import { HeaderNav } from './HeaderNav';

export function Header() {
	return (
		<header className="bg-white/10 backdrop-blur-sm border-b border-white/20">
			<div className="container mx-auto px-4">
				<nav className="flex items-center justify-between py-4">
					<Link href="/" className="font-bold text-xl">
						XRPL Clubhouse
					</Link>
					<HeaderNav />
				</nav>
			</div>
		</header>
	);
}
