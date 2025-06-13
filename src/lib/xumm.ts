import { Xumm } from 'xumm';
import { env } from '~/env';

let xummClient: Xumm | null = null;

export function getXummClient(): Xumm {
	if (!xummClient) {
		if (!env.XUMM_API_KEY || !env.XUMM_API_SECRET) {
			console.error('Missing Xumm credentials:', {
				hasApiKey: !!env.XUMM_API_KEY,
				hasApiSecret: !!env.XUMM_API_SECRET,
				apiKeyLength: env.XUMM_API_KEY?.length || 0,
			});
			throw new Error('Xumm API credentials are not configured');
		}

		console.log('Creating Xumm client with API key:', env.XUMM_API_KEY.substring(0, 8) + '...');
		xummClient = new Xumm(env.XUMM_API_KEY, env.XUMM_API_SECRET);
	}

	return xummClient;
}

export interface XummSignInPayload {
	txjson: {
		TransactionType: 'SignIn';
	};
}

export async function createSignInPayload() {
	const xumm = getXummClient();

	const payload: XummSignInPayload = {
		txjson: {
			TransactionType: 'SignIn',
		},
	};

	const created = await xumm.payload?.create(payload);

	return {
		uuid: created?.uuid,
		qrUrl: created?.refs?.qr_png,
		deeplink: (created?.refs as any)?.deeplink_url,
		websocketStatus: created?.refs?.websocket_status,
	};
}

export async function getPayloadStatus(uuid: string) {
	const xumm = getXummClient();
	const payload = await xumm.payload?.get(uuid);

	return {
		signed: payload?.meta?.signed || false,
		userToken: payload?.application?.issued_user_token,
		walletAddress: payload?.response?.account,
	};
}

export async function createTransactionPayload(transaction: any) {
	try {
		const xumm = getXummClient();

		console.log('Creating Xumm payload with transaction:', JSON.stringify(transaction, null, 2));
		console.log('Xumm client initialized:', !!xumm);
		console.log('Xumm payload method available:', !!xumm.payload);

		if (!xumm.payload) {
			throw new Error('Xumm client not properly initialized - payload method is undefined');
		}

		console.log('Calling xumm.payload.create...');
		const created = await xumm.payload.create({
			txjson: transaction,
		});

		console.log('Xumm API response received:', !!created);
		console.log('Xumm payload created:', JSON.stringify(created, null, 2));

		if (!created) {
			throw new Error('Failed to create Xumm payload - no response from Xumm API');
		}

		// Check if the response indicates an error
		if ((created as any).error) {
			console.error('Xumm API returned error:', (created as any).error);
			throw new Error(`Xumm API error: ${(created as any).error.message || (created as any).error}`);
		}

		// Check for missing required fields in response
		if (!created.uuid) {
			console.error('Xumm response missing UUID:', created);
			throw new Error('Xumm API response missing UUID');
		}

		return {
			uuid: created?.uuid,
			qrUrl: created?.refs?.qr_png,
			deeplink: (created?.refs as any)?.deeplink_url || created?.next?.always,
			websocketStatus: created?.refs?.websocket_status,
		};
	} catch (error) {
		console.error('Error in createTransactionPayload:', error);
		if (error instanceof Error) {
			console.error('Error details:', {
				name: error.name,
				message: error.message,
				stack: error.stack,
			});
		}
		throw error;
	}
}

export async function subscribeToPayload(uuid: string, callback: (data: any) => void) {
	const xumm = getXummClient();

	const subscription = xumm.payload?.subscribe(uuid, (event) => {
		callback(event.data);
	});

	return subscription;
}
