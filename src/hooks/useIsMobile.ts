import { useEffect, useState } from 'react';

export function useIsMobile() {
	const [isMobile, setIsMobile] = useState(false);
	const [isIOS, setIsIOS] = useState(false);
	const [isAndroid, setIsAndroid] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		
		const checkIsMobile = () => {
			// Check if it's a mobile device based on user agent
			const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
			const isMobileDevice = mobileRegex.test(navigator.userAgent);
			
			// Check specific OS
			const iosRegex = /iPhone|iPad|iPod/i;
			const androidRegex = /Android/i;
			
			setIsIOS(iosRegex.test(navigator.userAgent));
			setIsAndroid(androidRegex.test(navigator.userAgent));
			
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

	// Return false values during SSR to avoid hydration mismatch
	return { 
		isMobile: mounted ? isMobile : false, 
		isIOS: mounted ? isIOS : false, 
		isAndroid: mounted ? isAndroid : false 
	};
}