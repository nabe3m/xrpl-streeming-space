import {
	Client,
	Wallet,
	signPaymentChannelClaim,
	verifyPaymentChannelClaim,
	xrpToDrops,
} from 'xrpl';
import { env } from '~/env';

let client: Client | null = null;

export async function getXRPLClient(): Promise<Client> {
	if (!client) {
		client = new Client(env.XRPL_NETWORK);
		await client.connect();
	}
	return client;
}

export async function disconnectXRPLClient(): Promise<void> {
	if (client && client.isConnected()) {
		await client.disconnect();
		client = null;
	}
}

export async function getSignatureWallet(): Promise<Wallet> {
	if (!env.XRPL_SIGNATURE_SECRET) {
		throw new Error('XRPL_SIGNATURE_SECRET is not configured');
	}
	return Wallet.fromSecret(env.XRPL_SIGNATURE_SECRET);
}

export interface PaymentChannelCreationParams {
	senderAddress: string;
	receiverAddress: string;
	amountXRP: number;
	settleDelay?: number;
}

export async function createPaymentChannelTransaction(params: PaymentChannelCreationParams) {
	const signatureWallet = await getSignatureWallet();

	return {
		TransactionType: 'PaymentChannelCreate' as const,
		Account: params.senderAddress,
		Destination: params.receiverAddress,
		Amount: xrpToDrops(params.amountXRP),
		SettleDelay: params.settleDelay || 86400,
		PublicKey: signatureWallet.publicKey,
	};
}

export interface OffLedgerPayment {
	channelId: string;
	amount: string;
	signature: string;
}

export async function signOffLedgerPayment(
	channelId: string,
	amountXRP: number,
): Promise<OffLedgerPayment> {
	const signatureWallet = await getSignatureWallet();
	// Round to 6 decimal places (XRP precision limit)
	const roundedAmountXRP = Math.round(amountXRP * 1000000) / 1000000;
	const amountDrops = xrpToDrops(roundedAmountXRP);

	const signature = signPaymentChannelClaim(channelId, amountDrops, signatureWallet.privateKey);

	console.log('🚀 signature', signature);

	return {
		channelId,
		amount: amountDrops,
		signature,
	};
}

export async function verifyOffLedgerPayment(
	channelId: string,
	amountXRP: number,
	signature: string,
	publicKey: string,
): Promise<boolean> {
	// Round to 6 decimal places (XRP precision limit)
	const roundedAmountXRP = Math.round(amountXRP * 1000000) / 1000000;
	const amountDrops = xrpToDrops(roundedAmountXRP);
	return verifyPaymentChannelClaim(channelId, amountDrops, signature, publicKey);
}

export interface PaymentChannelClaimParams {
	channelId: string;
	balance: string;
	amount: string;
	signature: string;
	publicKey: string;
}

export async function createPaymentChannelClaimTransaction(params: PaymentChannelClaimParams) {
	return {
		TransactionType: 'PaymentChannelClaim' as const,
		Channel: params.channelId,
		Balance: params.balance,
		Amount: params.amount,
		Signature: params.signature,
		PublicKey: params.publicKey,
	};
}

export async function getAccountChannels(accountAddress: string, destinationAddress?: string) {
	const client = await getXRPLClient();

	const request: any = {
		command: 'account_channels',
		account: accountAddress,
	};

	if (destinationAddress) {
		request.destination_account = destinationAddress;
	}

	console.log('🚀 account_channels request:', request);
	const response = await client.request(request);
	console.log('🚀 account_channels response:', response.result);
	return (response.result as any).channels;
}

export async function getPaymentChannelsBetweenAddresses(
	senderAddress: string,
	receiverAddress: string,
) {
	console.log('🚀 getPaymentChannelsBetweenAddresses called:', {
		senderAddress,
		receiverAddress,
	});

	const client = await getXRPLClient();

	try {
		// まずaccount_channelsを試す
		try {
			console.log('🚀 Trying account_channels method...');
			const channels = await getAccountChannels(senderAddress, receiverAddress);
			if (channels && channels.length > 0) {
				console.log('🚀 Found channels using account_channels:', channels.length);
				return channels.map((ch: any) => ({
					...ch,
					status: ch.status || 'OPEN',
				}));
			}
		} catch (error) {
			console.log('🚀 account_channels failed, trying account_objects...', error);
		}
		// account_objectsを使って全てのオブジェクトを取得
		const response = await client.request({
			command: 'account_objects',
			account: senderAddress,
		});

		console.log('🚀 account_objects response:', response.result);

		const allObjects = (response.result as any).account_objects || [];

		console.log('🚀 Total account objects:', allObjects.length);

		// デバッグ用：全オブジェクトのタイプを表示
		const objectTypes = allObjects.map((obj: any) => obj.LedgerEntryType);
		console.log('🚀 Object types found:', [...new Set(objectTypes)]);

		// PayChannelオブジェクトのみを表示
		const payChannels = allObjects.filter((obj: any) => obj.LedgerEntryType === 'PayChannel');
		console.log('🚀 PayChannel objects found:', payChannels.length);
		payChannels.forEach((ch: any, index: number) => {
			console.log(`🚀 PayChannel ${index + 1}:`, {
				Destination: ch.Destination,
				Amount: ch.Amount,
				Balance: ch.Balance,
				PublicKey: ch.PublicKey,
				SettleDelay: ch.SettleDelay,
				index: ch.index,
			});
		});

		// 送信先が指定されたアドレスのペイメントチャネルをフィルタリング
		const channels = allObjects.filter(
			(obj: any) => obj.LedgerEntryType === 'PayChannel' && obj.Destination === receiverAddress,
		);

		console.log('🚀 Filtered channels for receiver:', channels.length);

		// account_channelsと同じ形式に変換
		return channels.map((ch: any) => ({
			channel_id: ch.index || ch.ChannelID,
			destination_account: ch.Destination,
			amount: ch.Amount,
			balance: ch.Balance || '0',
			public_key: ch.PublicKey,
			source_tag: ch.SourceTag,
			destination_tag: ch.DestinationTag,
			expiration: ch.Expiration,
			cancel_after: ch.CancelAfter,
			settle_delay: ch.SettleDelay,
			// チャネルが存在すればOPENとみなす（CLOSEDチャネルはaccount_objectsには含まれない）
			status: 'OPEN',
		}));
	} catch (error) {
		console.error('Error in getPaymentChannelsBetweenAddresses:', error);
		throw error;
	}
}

export function calculateXRPPerSecond(xrpPerMinute: number): number {
	return xrpPerMinute / 60;
}

export function calculateTotalXRP(seconds: number, xrpPerMinute: number): number {
	return (seconds / 60) * xrpPerMinute;
}
