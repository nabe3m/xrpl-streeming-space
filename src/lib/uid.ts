/**
 * Convert a string (like user ID) to a numeric UID for Agora
 * This must match the server-side logic in generateAgoraToken
 */
export function generateNumericUid(uid: string): number {
	let numericUid = 0;
	for (let i = 0; i < uid.length; i++) {
		numericUid = (numericUid << 5) - numericUid + uid.charCodeAt(i);
		numericUid = numericUid & numericUid; // Convert to 32bit integer
	}
	return Math.abs(numericUid) % 1000000; // Keep it under 1 million
}
