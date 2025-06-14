import { useEffect, useState } from 'react';

export function useIsMobile() {
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const checkIsMobile = () => {
			// Check if it's a mobile device based on user agent
			const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
			const isMobileDevice = mobileRegex.test(navigator.userAgent);
			
			// Also check screen width
			const isSmallScreen = window.innerWidth < 768;
			
			setIsMobile(isMobileDevice || isSmallScreen);
		};

		// Check on mount
		checkIsMobile();

		// Check on resize
		window.addEventListener('resize', checkIsMobile);

		return () => {
			window.removeEventListener('resize', checkIsMobile);
		};
	}, []);

	return isMobile;
}