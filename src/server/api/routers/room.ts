import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { generateAgoraToken } from '~/lib/agora';
import { getSignatureWallet } from '~/lib/xrpl';
import { generateTaxonForRoom, createNFTokenMinterTransaction } from '~/lib/xrpl-nft';
import { uploadToIPFS, uploadMetadataToIPFS, createNFTTicketMetadata } from '~/lib/ipfs';
import { createTransactionPayload } from '~/lib/xumm';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '~/server/api/trpc';

export const roomRouter = createTRPCRouter({
	create: protectedProcedure
		.input(
			z.object({
				title: z.string().min(1).max(100),
				description: z.string().optional(),
				paymentMode: z.enum(['PAYMENT_CHANNEL', 'NFT_TICKET']).default('PAYMENT_CHANNEL'),
				xrpPerMinute: z.number().min(0).default(0.01),
				nftTicketPrice: z.number().min(0).optional(),
				nftTicketImage: z.string().optional(), // Base64 image data
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const agoraChannelName = `room_${Date.now()}_${Math.random().toString(36).substring(7)}`;

			let nftTicketImageUrl: string | undefined;
			let nftTicketMetadataUri: string | undefined;
			let nftTicketTaxon: number | undefined;

			// If NFT ticket mode, prepare NFT data
			if (input.paymentMode === 'NFT_TICKET') {
				if (!input.nftTicketPrice || !input.nftTicketImage) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'NFT ticket price and image are required for NFT ticket mode',
					});
				}

				// Upload image to IPFS
				const base64Data = input.nftTicketImage.split(',')[1] || '';
				const imageBlob = new Blob([Buffer.from(base64Data, 'base64')]);
				const imageFile = new File([imageBlob], 'ticket.png', { type: 'image/png' });
				console.log('Uploading NFT ticket image to IPFS...');
				const imageResult = await uploadToIPFS(imageFile);
				nftTicketImageUrl = imageResult.url;
				console.log('NFT ticket image uploaded:', nftTicketImageUrl);

				// Get user info for metadata
				const user = await ctx.db.user.findUnique({
					where: { id: ctx.session.userId },
				});

				if (!user) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'User not found',
					});
				}

				// Create and upload metadata
				const roomId = `room_${Date.now()}`;
				nftTicketTaxon = generateTaxonForRoom(roomId);
				
				const metadata = createNFTTicketMetadata(
					input.title,
					input.description || null,
					nftTicketImageUrl,
					user.nickname || user.walletAddress,
					roomId,
					user.walletAddress  // ホストのウォレットアドレスを追加
				);
				
				console.log('Uploading NFT metadata to IPFS...');
				const metadataResult = await uploadMetadataToIPFS(metadata);
				nftTicketMetadataUri = metadataResult.url;
				console.log('NFT metadata uploaded:', nftTicketMetadataUri);
			}

			const room = await ctx.db.room.create({
				data: {
					title: input.title,
					description: input.description,
					creatorId: ctx.session.userId,
					agoraChannelName,
					paymentMode: input.paymentMode,
					xrpPerMinute: input.xrpPerMinute,
					nftTicketPrice: input.nftTicketPrice,
					nftTicketImageUrl,
					nftTicketMetadataUri,
					nftTicketTaxon,
				},
				include: {
					creator: true,
				},
			});

			await ctx.db.roomParticipant.create({
				data: {
					roomId: room.id,
					userId: ctx.session.userId,
					role: 'HOST',
				},
			});

			return room;
		}),

	get: publicProcedure
		.input(
			z.object({
				id: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const room = await ctx.db.room.findUnique({
				where: { id: input.id },
				include: {
					creator: true,
					participants: {
						where: {
							leftAt: null, // 退出していない参加者のみ取得
						},
						include: {
							user: true,
						},
					},
					paymentChannels: true,
				},
			});

			if (!room) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Room not found',
				});
			}

			return room;
		}),

	list: publicProcedure
		.input(
			z.object({
				status: z.enum(['WAITING', 'LIVE', 'ENDED']).optional(),
				limit: z.number().min(1).max(100).default(20),
				cursor: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const rooms = await ctx.db.room.findMany({
				where: input.status ? { status: input.status } : undefined,
				take: input.limit + 1,
				cursor: input.cursor ? { id: input.cursor } : undefined,
				orderBy: { createdAt: 'desc' },
				include: {
					creator: true,
				},
			});

			// 各ルームのアクティブな参加者数を取得
			const roomsWithCount = await Promise.all(
				rooms.map(async (room) => {
					const activeParticipants = await ctx.db.roomParticipant.count({
						where: {
							roomId: room.id,
							leftAt: null,
						},
					});
					return {
						...room,
						_count: {
							participants: activeParticipants,
						},
					};
				}),
			);

			let nextCursor: typeof input.cursor | undefined = undefined;
			if (roomsWithCount.length > input.limit) {
				const nextItem = roomsWithCount.pop();
				nextCursor = nextItem!.id;
			}

			return {
				items: roomsWithCount,
				nextCursor,
			};
		}),

	join: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const room = await ctx.db.room.findUnique({
				where: { id: input.roomId },
				include: {
					creator: true,
				},
			});

			if (!room) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Room not found',
				});
			}

			if (room.status === 'ENDED') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Room has ended',
				});
			}

			const existingParticipant = await ctx.db.roomParticipant.findUnique({
				where: {
					roomId_userId: {
						roomId: input.roomId,
						userId: ctx.session.userId,
					},
				},
			});

			if (existingParticipant) {
				// 既存の参加者が再参加する場合、leftAtをリセット
				if (existingParticipant.leftAt) {
					const updated = await ctx.db.roomParticipant.update({
						where: { id: existingParticipant.id },
						data: {
							leftAt: null,
							joinedAt: new Date(), // 再参加時刻を更新
						},
					});
					return updated;
				}
				return existingParticipant;
			}

			const participant = await ctx.db.roomParticipant.create({
				data: {
					roomId: input.roomId,
					userId: ctx.session.userId,
					role: 'LISTENER',
				},
			});

			return participant;
		}),

	leave: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const participant = await ctx.db.roomParticipant.findUnique({
				where: {
					roomId_userId: {
						roomId: input.roomId,
						userId: ctx.session.userId,
					},
				},
			});

			if (!participant) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Participant not found',
				});
			}

			const now = new Date();
			const timeInRoom = Math.floor((now.getTime() - participant.joinedAt.getTime()) / 1000);

			await ctx.db.roomParticipant.update({
				where: { id: participant.id },
				data: {
					leftAt: now,
					totalTimeSeconds: participant.totalTimeSeconds + timeInRoom,
				},
			});

			return { success: true };
		}),

	start: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
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
					message: 'Only room creator can start the room',
				});
			}

			if (room.status !== 'WAITING') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Room is not in waiting status',
				});
			}

			const updatedRoom = await ctx.db.room.update({
				where: { id: input.roomId },
				data: {
					status: 'LIVE',
					startedAt: new Date(),
				},
			});

			return updatedRoom;
		}),

	end: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
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
					message: 'Only room creator can end the room',
				});
			}

			if (room.status !== 'LIVE') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Room is not live',
				});
			}

			const now = new Date();

			await ctx.db.roomParticipant.updateMany({
				where: {
					roomId: input.roomId,
					leftAt: null,
				},
				data: {
					leftAt: now,
				},
			});

			const updatedRoom = await ctx.db.room.update({
				where: { id: input.roomId },
				data: {
					status: 'ENDED',
					endedAt: now,
				},
			});

			return updatedRoom;
		}),

	getSignaturePublicKey: publicProcedure.query(async () => {
		try {
			const wallet = await getSignatureWallet();
			return { publicKey: wallet.publicKey };
		} catch (error) {
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: 'Failed to get signature public key',
			});
		}
	}),

	getAgoraToken: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const participant = await ctx.db.roomParticipant.findUnique({
				where: {
					roomId_userId: {
						roomId: input.roomId,
						userId: ctx.session.userId,
					},
				},
				include: {
					room: true,
				},
			});

			if (!participant) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Participant not found',
				});
			}

			try {
				// ロールを決定（ホストまたは発言権を持つリスナーはPUBLISHERトークンを取得）
				const tokenRole = participant.role === 'HOST' || participant.canSpeak ? 'HOST' : 'LISTENER';

				const token = generateAgoraToken(
					participant.room.agoraChannelName,
					ctx.session.userId,
					tokenRole,
					3600, // 1 hour expiration
				);

				return { token };
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to generate Agora token',
				});
			}
		}),

	requestSpeak: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const participant = await ctx.db.roomParticipant.findUnique({
				where: {
					roomId_userId: {
						roomId: input.roomId,
						userId: ctx.session.userId,
					},
				},
			});

			if (!participant) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Participant not found',
				});
			}

			if (participant.role === 'HOST') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Host already has speaking permission',
				});
			}

			if (participant.canSpeak) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Already has speaking permission',
				});
			}

			const updated = await ctx.db.roomParticipant.update({
				where: { id: participant.id },
				data: {
					speakRequestedAt: new Date(),
				},
			});

			return updated;
		}),

	grantSpeak: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
				participantId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// ホストかどうか確認
			const room = await ctx.db.room.findUnique({
				where: { id: input.roomId },
			});

			if (!room || room.creatorId !== ctx.session.userId) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only room host can grant speak permission',
				});
			}

			const participant = await ctx.db.roomParticipant.findFirst({
				where: {
					id: input.participantId,
					roomId: input.roomId,
				},
			});

			if (!participant) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Participant not found',
				});
			}

			const updated = await ctx.db.roomParticipant.update({
				where: { id: participant.id },
				data: {
					canSpeak: true,
					speakRequestedAt: null,
				},
			});

			return updated;
		}),

	revokeSpeak: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
				participantId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// ホストかどうか確認
			const room = await ctx.db.room.findUnique({
				where: { id: input.roomId },
			});

			if (!room || room.creatorId !== ctx.session.userId) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only room host can revoke speak permission',
				});
			}

			const participant = await ctx.db.roomParticipant.findFirst({
				where: {
					id: input.participantId,
					roomId: input.roomId,
				},
			});

			if (!participant) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Participant not found',
				});
			}

					const updated = await ctx.db.roomParticipant.update({
			where: { id: participant.id },
			data: {
				canSpeak: false,
				speakRequestedAt: null, // リクエスト状態もリセット
			},
		});

		return updated;
		}),

	releaseSpeakPermission: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// 自分の参加情報を取得
			const participant = await ctx.db.roomParticipant.findUnique({
				where: {
					roomId_userId: {
						roomId: input.roomId,
						userId: ctx.session.userId,
					},
				},
			});

			if (!participant) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Participant not found',
				});
			}

			// ホストは権限を放棄できない
			if (participant.role === 'HOST') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Host cannot release speak permission',
				});
			}

			// スピーカー権限を持っていない場合は何もしない
			if (!participant.canSpeak) {
				return participant;
			}

			// スピーカー権限を放棄
			const updated = await ctx.db.roomParticipant.update({
				where: { id: participant.id },
				data: {
					canSpeak: false,
				},
			});

			console.log('Speaker permission released for user:', ctx.session.userId);
			return updated;
		}),

	// Check NFTokenMinter settings for room creation
	checkNFTokenMinterSettings: protectedProcedure
		.query(async ({ ctx }) => {
			const user = await ctx.db.user.findUnique({
				where: { id: ctx.session.userId },
			});

			if (!user) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'User not found',
				});
			}

			// Get signature wallet address
			const signatureWallet = await getSignatureWallet();
			const minterAddress = signatureWallet.address;

			// データベースから認可状態を確認
			const isAuthorized = user.nftokenMinter === minterAddress;

			console.log(`NFTokenMinter check for ${user.walletAddress}:`, {
				minterAddress,
				isAuthorized,
				dbNftokenMinter: user.nftokenMinter,
				dbNftokenMinterSetAt: user.nftokenMinterSetAt,
				timestamp: new Date().toISOString(),
			});
			
			// 追加のデバッグ情報
			try {
				const { getXRPLClient } = await import('~/lib/xrpl');
				const client = await getXRPLClient();
				
				// 直接account_infoを確認
				const accountInfo = await client.request({
					command: 'account_info',
					account: user.walletAddress,
					ledger_index: 'validated',
				});
				
				console.log('Direct account_info check:', {
					account: user.walletAddress,
					hasNFTokenMinter: 'NFTokenMinter' in accountInfo.result.account_data,
					NFTokenMinter: (accountInfo.result.account_data as any).NFTokenMinter,
					flags: accountInfo.result.account_data.Flags,
				});
			} catch (e) {
				console.error('Debug check failed:', e);
			}

			return {
				userAddress: user.walletAddress,
				minterAddress,
				isAuthorized,
			};
		}),

	// Create NFTokenMinter authorization payload
	authorizeMinter: protectedProcedure
		.mutation(async ({ ctx }) => {
			const user = await ctx.db.user.findUnique({
				where: { id: ctx.session.userId },
			});

			if (!user) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'User not found',
				});
			}

			// Get signature wallet address
			const signatureWallet = await getSignatureWallet();
			const minterAddress = signatureWallet.address;

			// Create AccountSet transaction
			const transaction = createNFTokenMinterTransaction(
				user.walletAddress,
				minterAddress
			);

			// Create Xumm payload
			const payload = await createTransactionPayload(transaction);

			return {
				payload,
				minterAddress,
			};
		}),

	// Clear NFTokenMinter (for debugging/reset)
	clearMinter: protectedProcedure
		.mutation(async ({ ctx }) => {
			const user = await ctx.db.user.findUnique({
				where: { id: ctx.session.userId },
			});

			if (!user) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'User not found',
				});
			}

			// Create AccountSet transaction to clear NFTokenMinter
			const { clearNFTokenMinterTransaction } = await import('~/lib/xrpl-nft');
			const transaction = clearNFTokenMinterTransaction(user.walletAddress);

			// Create Xumm payload
			const payload = await createTransactionPayload(transaction);

			return {
				payload,
			};
		}),

	// Confirm NFTokenMinter authorization after transaction
	confirmMinterAuthorization: protectedProcedure
		.input(
			z.object({
				transactionHash: z.string(),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const user = await ctx.db.user.findUnique({
				where: { id: ctx.session.userId },
			});

			if (!user) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'User not found',
				});
			}

			// Get signature wallet address
			const signatureWallet = await getSignatureWallet();
			const minterAddress = signatureWallet.address;

			// Update user with NFTokenMinter settings
			await ctx.db.user.update({
				where: { id: ctx.session.userId },
				data: {
					nftokenMinter: minterAddress,
					nftokenMinterSetAt: new Date(),
				},
			});

			console.log('NFTokenMinter authorization confirmed in database:', {
				userId: ctx.session.userId,
				walletAddress: user.walletAddress,
				minterAddress,
				transactionHash: input.transactionHash,
			});

			return { success: true };
		}),
});
