import { RtcRole, RtcTokenBuilder } from 'agora-token';
import { env } from '~/env';

export function generateAgoraToken(
	channelName: string,
	uid: string,
	role: 'HOST' | 'LISTENER',
	expireTimeInSeconds = 3600,
): string {
	const appId = env.AGORA_APP_ID;
	const appCertificate = env.AGORA_APP_CERTIFICATE;

	if (!appId || !appCertificate) {
		throw new Error('Agora App ID or Certificate not configured');
	}

	const currentTimestamp = Math.floor(Date.now() / 1000);
	const privilegeExpiredTs = currentTimestamp + expireTimeInSeconds;

	// Convert string UID to number for token generation
	// Use a hash of the string to get a consistent numeric UID
	let numericUid = 0;
	if (uid) {
		// Simple hash function to convert string to number
		for (let i = 0; i < uid.length; i++) {
			numericUid = (numericUid << 5) - numericUid + uid.charCodeAt(i);
			numericUid = numericUid & numericUid; // Convert to 32bit integer
		}
		numericUid = Math.abs(numericUid) % 1000000; // Keep it under 1 million
	}

	// Use RtcRole enum from agora-token package
	const agoraRole = role === 'HOST' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

	console.log('Generating Agora token:', {
		channelName,
		uid,
		numericUid,
		role,
		agoraRole,
		privilegeExpiredTs: new Date(privilegeExpiredTs * 1000).toISOString(),
	});

	const token = RtcTokenBuilder.buildTokenWithUid(
		appId,
		appCertificate,
		channelName,
		numericUid,
		agoraRole,
		privilegeExpiredTs,
		privilegeExpiredTs,
	);

	console.log('Generated token:', token.substring(0, 50) + '...');

	return token;
}
