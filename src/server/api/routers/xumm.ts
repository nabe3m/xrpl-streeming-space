import { z } from 'zod';
import { env } from '~/env';
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';

// サーバーサイドでのXumm初期化
let xummInstance: any = null;

const getXumm = async () => {
	if (!xummInstance) {
		const { Xumm } = await import('xumm');
		xummInstance = new Xumm(env.XUMM_API_KEY, env.XUMM_API_SECRET);
	}
	return xummInstance;
};

export const xummRouter = createTRPCRouter({
	createPaymentChannelClaimPayload: publicProcedure
		.input(
			z.object({
				account: z.string(),
				channelId: z.string(),
				flags: z.number().optional().default(0),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const xumm = await getXumm();

				const transaction = {
					TransactionType: 'PaymentChannelClaim',
					Account: input.account,
					Channel: input.channelId,
					Flags: input.flags,
				};

				console.log('Creating Xumm payload:', transaction);

				const payload = await xumm.payload.create({
					txjson: transaction,
				});

				console.log('Created payload:', payload);

				return {
					uuid: payload.uuid,
					next: payload.next,
					refs: payload.refs,
				};
			} catch (error) {
				console.error('Xumm payload creation error:', error);
				throw new Error(`Failed to create Xumm payload: ${error}`);
			}
		}),

	createPaymentChannelPayload: publicProcedure
		.input(
			z.object({
				transaction: z.object({
					TransactionType: z.string(),
					Account: z.string(),
					Destination: z.string(),
					Amount: z.string(),
					PublicKey: z.string(),
					SettleDelay: z.number(),
					DestinationTag: z.number().optional(),
				}),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const xumm = await getXumm();

				console.log('Creating payment channel Xumm payload:', input.transaction);

				const payload = await xumm.payload.create({
					txjson: input.transaction,
				});

				console.log('Created payment channel payload:', payload);

				return {
					uuid: payload.uuid,
					next: payload.next,
					refs: payload.refs,
				};
			} catch (error) {
				console.error('Payment channel Xumm payload creation error:', error);
				throw new Error(`Failed to create payment channel Xumm payload: ${error}`);
			}
		}),

	getPayloadResult: publicProcedure
		.input(
			z.object({
				uuid: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const xumm = await getXumm();
				const result = await xumm.payload.get(input.uuid);

				return {
					meta: result.meta,
					response: result.response,
					custom_meta: result.custom_meta,
				};
			} catch (error) {
				console.error('Xumm payload get error:', error);
				throw new Error(`Failed to get payload result: ${error}`);
			}
		}),
});
