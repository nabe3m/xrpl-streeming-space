import { useEffect, useState } from 'react';

export function useScrolled(threshold: number = 60) {
	const [isScrolled, setIsScrolled] = useState(false);

	useEffect(() => {
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

	return isScrolled;
}