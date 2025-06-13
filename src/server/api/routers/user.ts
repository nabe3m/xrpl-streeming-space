import crypto from 'crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';

export const userRouter = createTRPCRouter({
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

		return user;
	}),

	getProfile: protectedProcedure.query(async ({ ctx }) => {
		const user = await ctx.db.user.findUnique({
			where: { id: ctx.session.userId },
		});

		if (!user) {
			throw new TRPCError({
				code: 'NOT_FOUND',
				message: 'User not found',
			});
		}

		return user;
	}),

	updateProfile: protectedProcedure
		.input(
			z.object({
				nickname: z.string().min(1).max(50).optional(),
				avatarUrl: z.string().url().optional().nullable(),
				emailHash: z.string().optional().nullable(),
				twitterHandle: z
					.string()
					.regex(/^[A-Za-z0-9_]*$/)
					.max(15)
					.optional()
					.nullable(),
				facebookHandle: z.string().max(50).optional().nullable(),
				instagramHandle: z
					.string()
					.regex(/^[A-Za-z0-9._]*$/)
					.max(30)
					.optional()
					.nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const updatedUser = await ctx.db.user.update({
				where: { id: ctx.session.userId },
				data: input,
			});

			return updatedUser;
		}),

	setEmail: protectedProcedure
		.input(
			z.object({
				email: z.string().email(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const emailHash = crypto
				.createHash('md5')
				.update(input.email.toLowerCase().trim())
				.digest('hex');

			const updatedUser = await ctx.db.user.update({
				where: { id: ctx.session.userId },
				data: { emailHash },
			});

			return {
				success: true,
				gravatarUrl: `https://www.gravatar.com/avatar/${emailHash}`,
			};
		}),

	getRoomHistory: protectedProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(100).default(20),
				cursor: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const rooms = await ctx.db.room.findMany({
				where: { creatorId: ctx.session.userId },
				take: input.limit + 1,
				cursor: input.cursor ? { id: input.cursor } : undefined,
				orderBy: { createdAt: 'desc' },
				include: {
					_count: {
						select: { participants: true },
					},
				},
			});

			let nextCursor: typeof input.cursor | undefined = undefined;
			if (rooms.length > input.limit) {
				const nextItem = rooms.pop();
				nextCursor = nextItem!.id;
			}

			return {
				items: rooms,
				nextCursor,
			};
		}),

	getParticipationHistory: protectedProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(100).default(20),
				cursor: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const participations = await ctx.db.roomParticipant.findMany({
				where: { userId: ctx.session.userId },
				take: input.limit + 1,
				cursor: input.cursor ? { id: input.cursor } : undefined,
				orderBy: { joinedAt: 'desc' },
				include: {
					room: {
						include: {
							creator: true,
						},
					},
				},
			});

			let nextCursor: typeof input.cursor | undefined = undefined;
			if (participations.length > input.limit) {
				const nextItem = participations.pop();
				nextCursor = nextItem!.id;
			}

			return {
				items: participations,
				nextCursor,
			};
		}),

	getMintedNFTs: protectedProcedure.query(async ({ ctx }) => {
		const nfts = await ctx.db.nFT.findMany({
			where: { creatorId: ctx.session.userId },
			orderBy: { createdAt: 'desc' },
		});

		return nfts;
	}),
});
