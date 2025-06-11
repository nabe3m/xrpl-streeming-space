import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { createTransactionPayload } from '~/lib/xumm';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';

export const nftRouter = createTRPCRouter({
	prepareMint: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
				title: z.string().min(1).max(100),
				description: z.string().optional(),
				imageUrl: z.string().url(),
				recipientAddresses: z.array(z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const room = await ctx.db.room.findUnique({
				where: { id: input.roomId },
			});

			if (!room) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Room not found',
				});
			}

			if (room.creatorId !== ctx.session.userId) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only room creator can mint NFTs',
				});
			}

			const user = await ctx.db.user.findUnique({
				where: { id: ctx.session.userId },
			});

			if (!user) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'User not found',
				});
			}

			const metadata = {
				name: input.title,
				description: input.description || `Participation NFT for ${room.title}`,
				image: input.imageUrl,
				properties: {
					room: room.title,
					roomId: room.id,
					date: room.createdAt.toISOString(),
					host: user.nickname || user.walletAddress,
				},
			};

			const metadataUri = `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;

			const transactions = input.recipientAddresses.map((recipientAddress) => ({
				TransactionType: 'NFTokenMint' as const,
				Account: user.walletAddress,
				NFTokenTaxon: 0,
				Flags: 8,
				TransferFee: 0,
				URI: Buffer.from(metadataUri).toString('hex'),
				Memos: [
					{
						Memo: {
							MemoType: Buffer.from('recipient').toString('hex'),
							MemoData: Buffer.from(recipientAddress).toString('hex'),
						},
					},
				],
			}));

			const payloads = await Promise.all(transactions.map((tx) => createTransactionPayload(tx)));

			return { payloads, metadata };
		}),

	confirmMint: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
				tokenId: z.string(),
				title: z.string(),
				description: z.string().optional(),
				imageUrl: z.string().url(),
				metadataUri: z.string(),
				transactionHash: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const nft = await ctx.db.nFT.create({
				data: {
					tokenId: input.tokenId,
					creatorId: ctx.session.userId,
					title: input.title,
					description: input.description,
					imageUrl: input.imageUrl,
					metadataUri: input.metadataUri,
					roomId: input.roomId,
					transactionHash: input.transactionHash,
				},
			});

			return nft;
		}),

	uploadToIPFS: protectedProcedure
		.input(
			z.object({
				content: z.string(),
				filename: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!process.env.IPFS_API_URL || !process.env.IPFS_API_KEY) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'IPFS is not configured',
				});
			}

			return {
				url: `ipfs://mock-hash/${input.filename}`,
				hash: 'mock-hash',
			};
		}),
});
