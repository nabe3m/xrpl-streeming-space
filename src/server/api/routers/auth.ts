import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createSignInPayload, getPayloadStatus } from '~/lib/xumm';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc';

export const authRouter = createTRPCRouter({
	createSignInPayload: publicProcedure.mutation(async ({ ctx }) => {
		try {
			const payload = await createSignInPayload();
			return payload;
		} catch (error) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: 'Failed to create sign-in payload',
			});
		}
	}),

	verifySignIn: publicProcedure
		.input(
			z.object({
				uuid: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				console.log('Verifying sign-in for UUID:', input.uuid);
				const status = await getPayloadStatus(input.uuid);
				console.log('Payload status:', status);

				if (!status.signed || !status.walletAddress) {
					console.log('Payload not signed or missing wallet address');
					return { user: null };
				}

				let user = await ctx.db.user.findUnique({
					where: { walletAddress: status.walletAddress },
				});

				if (!user) {
					console.log('Creating new user for wallet:', status.walletAddress);
					user = await ctx.db.user.create({
						data: {
							walletAddress: status.walletAddress,
						},
					});
				}

				return {
					user: {
						id: user.id,
						walletAddress: user.walletAddress,
						nickname: user.nickname,
						avatarUrl: user.avatarUrl,
					},
				};
			} catch (error) {
				console.error('Error in verifySignIn:', error);
				if (error instanceof Error) {
					console.error('Error details:', {
						name: error.name,
						message: error.message,
						stack: error.stack,
					});
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: error instanceof Error ? error.message : 'Failed to verify sign-in',
				});
			}
		}),

	getCurrentUser: protectedProcedure.query(async ({ ctx }) => {
		const user = await ctx.db.user.findUnique({
			where: { id: ctx.session.userId },
		});

		if (!user) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'User not found',
			});
		}

		return {
			id: user.id,
			walletAddress: user.walletAddress,
			nickname: user.nickname,
			avatarUrl: user.avatarUrl,
			emailHash: user.emailHash,
			twitterHandle: user.twitterHandle,
			facebookHandle: user.facebookHandle,
			instagramHandle: user.instagramHandle,
		};
	}),
});
