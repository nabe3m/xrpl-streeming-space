import { Xumm } from 'xumm';
import { env } from '~/env';

let xummClient: Xumm | null = null;

export function getXummClient(): Xumm {
	if (!xummClient) {
		if (!env.XUMM_API_KEY || !env.XUMM_API_SECRET) {
			throw new Error('Xumm API credentials are not configured');
		}

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
	const xumm = getXummClient();

	const created = await xumm.payload?.create({
		txjson: transaction,
	});

	return {
		uuid: created?.uuid,
		qrUrl: created?.refs?.qr_png,
		deeplink: (created?.refs as any)?.deeplink_url,
		websocketStatus: created?.refs?.websocket_status,
	};
}

export async function subscribeToPayload(uuid: string, callback: (data: any) => void) {
	const xumm = getXummClient();

	const subscription = xumm.payload?.subscribe(uuid, (event) => {
		callback(event.data);
	});

	return subscription;
}
