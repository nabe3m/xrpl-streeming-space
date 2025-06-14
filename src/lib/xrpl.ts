import {
	Client,
	Wallet,
	signPaymentChannelClaim,
	verifyPaymentChannelClaim,
	xrpToDrops,
	dropsToXrp,
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
	const wallet = Wallet.fromSecret(env.XRPL_SIGNATURE_SECRET);
	
	// デバッグ: 環境変数のアドレスと実際のウォレットアドレスを比較
	if (env.XRPL_SIGNATURE_ADDRESS && wallet.address !== env.XRPL_SIGNATURE_ADDRESS) {
		console.warn('⚠️ Signature wallet address mismatch!');
		console.warn('Expected (from env):', env.XRPL_SIGNATURE_ADDRESS);
		console.warn('Actual (from secret):', wallet.address);
	}
	
	return wallet;
}

export interface PaymentChannelCreationParams {
	senderAddress: string;
	receiverAddress: string;
	amountXRP: number;
	settleDelay?: number;
}

export async function createPaymentChannelTransaction(params: PaymentChannelCreationParams) {
	const signatureWallet = await getSignatureWallet();

	console.log('🚀 Creating PaymentChannel with signature wallet:', {
		publicKey: signatureWallet.publicKey,
		address: signatureWallet.address,
		publicKeyLength: signatureWallet.publicKey.length,
		publicKeyUppercase: signatureWallet.publicKey.toUpperCase(),
	});

	return {
		TransactionType: 'PaymentChannelCreate' as const,
		Account: params.senderAddress,
		Destination: params.receiverAddress,
		Amount: xrpToDrops(params.amountXRP),
		SettleDelay: params.settleDelay || 86400,
		PublicKey: signatureWallet.publicKey.toUpperCase(),
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

	// Ensure channel ID is uppercase
	const normalizedChannelId = channelId.toUpperCase();

	console.log('🔐 Signing off-ledger payment:', {
		channelId: normalizedChannelId,
		channelIdLength: normalizedChannelId.length,
		amountXRP: roundedAmountXRP,
		amountDrops,
		publicKey: signatureWallet.publicKey.toUpperCase(),
		address: signatureWallet.address,
	});

	const signature = signPaymentChannelClaim(normalizedChannelId, roundedAmountXRP.toString(), signatureWallet.privateKey);

	// Ensure signature is uppercase for consistency
	const normalizedSignature = signature.toUpperCase();
	
	console.log('🚀 Generated signature:', normalizedSignature);
	console.log('🚀 Signature wallet public key:', signatureWallet.publicKey.toUpperCase());

	return {
		channelId: normalizedChannelId,
		amount: amountDrops,
		signature: normalizedSignature,
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
	
	// Ensure consistent case for all parameters
	const normalizedChannelId = channelId.toUpperCase();
	const normalizedSignature = signature.toUpperCase();
	const normalizedPublicKey = publicKey.toUpperCase();
	
	console.log('🔍 Verifying payment signature:', {
		channelId: normalizedChannelId,
		channelIdLength: normalizedChannelId.length,
		amountXRP: roundedAmountXRP,
		amountDrops,
		signatureLength: normalizedSignature.length,
		publicKeyLength: normalizedPublicKey.length,
		publicKey: normalizedPublicKey.substring(0, 16) + '...',
	});
	
	const isValid = verifyPaymentChannelClaim(normalizedChannelId, roundedAmountXRP.toString(), normalizedSignature, normalizedPublicKey);
	console.log('🔍 Verification result:', isValid ? '✅ VALID' : '❌ INVALID');
	
	return isValid;
}

export interface PaymentChannelClaimParams {
	channelId: string;
	balance: string;
	amount: string;
	signature: string;
	publicKey: string;
	accountAddress: string;
}

export async function createPaymentChannelClaimTransaction(params: PaymentChannelClaimParams) {
	// Ensure channel ID is uppercase
	const normalizedChannelId = params.channelId.toUpperCase();
	
	// Get channel info from ledger to determine actual claimable amount
	const channelInfo = await getPaymentChannelInfo(normalizedChannelId);
	if (!channelInfo) {
		throw new Error(`Payment channel ${normalizedChannelId} not found on ledger`);
	}
	
	// Calculate the actual claimable amount
	const depositAmount = BigInt(channelInfo.amount);
	const claimedAmount = BigInt(channelInfo.balance);
	const requestedAmount = BigInt(params.balance);
	
	// The actual amount we can claim is the minimum of:
	// 1. What was requested (based on signature)
	// 2. What's actually available (deposit - already claimed)
	const availableAmount = depositAmount - claimedAmount;
	const actualClaimAmount = requestedAmount <= depositAmount ? requestedAmount : depositAmount;
	
	// For the Balance field in the claim, we need to specify the total cumulative amount
	// that will have been claimed after this transaction (not the delta)
	const newTotalClaimed = claimedAmount + (actualClaimAmount - claimedAmount);
	const balanceDrops = newTotalClaimed.toString();
	
	console.log('📝 Creating claim transaction with calculated amounts:', {
		channelId: normalizedChannelId,
		depositAmount: dropsToXrp(depositAmount.toString()),
		alreadyClaimed: dropsToXrp(claimedAmount.toString()),
		requestedAmount: dropsToXrp(requestedAmount.toString()),
		availableAmount: dropsToXrp(availableAmount.toString()),
		actualClaimAmount: dropsToXrp(actualClaimAmount.toString()),
		newTotalClaimed: dropsToXrp(balanceDrops),
		deltaAmount: dropsToXrp((actualClaimAmount - claimedAmount).toString()),
	});
	
	// Check if publicKey is in Base58 format (starts with 'a' and has specific length)
	let publicKeyHex = params.publicKey;
	if (publicKeyHex.startsWith('a') && publicKeyHex.length > 40 && publicKeyHex.length < 60) {
		console.log('Public key appears to be in Base58 format, using signature wallet public key instead');
		// Get the correct hex format public key from the signature wallet
		const signatureWallet = await getSignatureWallet();
		publicKeyHex = signatureWallet.publicKey;
		console.log('Using hex public key from signature wallet:', publicKeyHex);
		console.log('Signature wallet address:', signatureWallet.address);
	}
	
	const transaction = {
		TransactionType: 'PaymentChannelClaim' as const,
		Account: params.accountAddress,
		Channel: normalizedChannelId,
		Balance: balanceDrops,
		// Amount field is omitted - XRPL will automatically claim the difference
		Signature: params.signature.toUpperCase(),
		PublicKey: publicKeyHex.toUpperCase(),
	};
	
	console.log('Creating PaymentChannelClaim transaction:', JSON.stringify(transaction, null, 2));
	
	// Verify signature locally before sending
	try {
		const isValid = await verifyOffLedgerPayment(
			normalizedChannelId,
			Number(dropsToXrp(params.balance)), // Verify against the original signed amount
			params.signature,
			publicKeyHex
		);
		console.log('🔍 Local signature verification:', isValid ? '✅ VALID' : '❌ INVALID');
		
		if (!isValid) {
			console.error('⚠️ WARNING: Signature verification failed locally. This may cause tecBAD_SIGNATURE on ledger.');
			console.error('Debug info:', {
				channelId: normalizedChannelId,
				signedAmount: params.balance,
				signatureFirst20: params.signature.substring(0, 20),
				publicKeyFirst20: publicKeyHex.substring(0, 20),
			});
		}
	} catch (error) {
		console.error('Failed to verify signature locally:', error);
	}
	
	return transaction;
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

export async function checkChannelExists(channelId: string): Promise<boolean> {
	const client = await getXRPLClient();
	
	try {
		const response = await client.request({
			command: 'ledger_entry',
			index: channelId.toUpperCase(),
		});
		
		// If the channel exists, it will return the ledger entry
		return !!response.result.node;
	} catch (error: any) {
		// If the channel doesn't exist, it will throw an error with 'entryNotFound'
		if (error?.data?.error === 'entryNotFound') {
			console.log('Channel not found on ledger:', channelId);
			return false;
		}
		console.error('Error checking channel existence:', error);
		throw error;
	}
}

export interface PaymentChannelInfo {
	channelId: string;
	account: string;
	destination: string;
	amount: string; // Total deposit amount in drops
	balance: string; // Total claimed amount in drops
	publicKey: string;
	settleDelay: number;
	expiration?: number;
	cancelAfter?: number;
	sourceTag?: number;
	destinationTag?: number;
}

export async function getPaymentChannelInfo(channelId: string): Promise<PaymentChannelInfo | null> {
	const client = await getXRPLClient();
	
	try {
		const response = await client.request({
			command: 'ledger_entry',
			index: channelId.toUpperCase(),
		});
		
		if (!response.result.node) {
			return null;
		}
		
		const node = response.result.node as any;
		console.log('Payment Channel ledger entry:', JSON.stringify(node, null, 2));
		
		// Extract payment channel data
		const channelData: PaymentChannelInfo = {
			channelId: channelId.toUpperCase(),
			account: node.Account,
			destination: node.Destination,
			amount: node.Amount, // Total deposit
			balance: node.Balance || '0', // Total claimed (defaults to 0 if not present)
			publicKey: node.PublicKey,
			settleDelay: node.SettleDelay,
			expiration: node.Expiration,
			cancelAfter: node.CancelAfter,
			sourceTag: node.SourceTag,
			destinationTag: node.DestinationTag,
		};
		
		console.log('Parsed channel info:', {
			channelId: channelData.channelId,
			depositAmount: dropsToXrp(channelData.amount),
			claimedAmount: dropsToXrp(channelData.balance),
			remainingAmount: dropsToXrp((BigInt(channelData.amount) - BigInt(channelData.balance)).toString()),
		});
		
		return channelData;
	} catch (error: any) {
		if (error?.data?.error === 'entryNotFound') {
			console.log('Channel not found on ledger:', channelId);
			return null;
		}
		console.error('Error getting channel info:', error);
		throw error;
	}
}