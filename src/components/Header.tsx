import Link from 'next/link';
import { HeaderNav } from './HeaderNav';

export function Header() {
	return (
		<header className="border-white/20 border-b bg-white/10 backdrop-blur-sm sticky top-0 z-30">
			<div className="container mx-auto px-4">
				<nav className="flex items-center justify-between py-4">
					<Link href="/" className="font-bold text-lg md:text-xl">
						XRP <span className="text-[hsl(200,100%,70%)]">Spaces</span>
					</Link>
					<HeaderNav />
				</nav>
			</div>
		</header>
	);
}
