import { useEffect, useState } from 'react';

export function useScrolled(threshold: number = 60) {
	const [isScrolled, setIsScrolled] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		
		const handleScroll = () => {
			const scrollTop = window.scrollY || document.documentElement.scrollTop;
			setIsScrolled(scrollTop > threshold);
		};

		// Check on mount
		handleScroll();

		// Add scroll listener
		window.addEventListener('scroll', handleScroll, { passive: true });

		return () => {
			window.removeEventListener('scroll', handleScroll);
		};
	}, [threshold]);

	// Return false during SSR to avoid hydration mismatch
	return mounted ? isScrolled : false;
}