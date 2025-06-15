import { TRPCError } from '@trpc/server';
import { dropsToXrp, xrpToDrops } from 'xrpl';
import { z } from 'zod';
import {
	createPaymentChannelClaimTransaction,
	createPaymentChannelTransaction,
	getPaymentChannelsBetweenAddresses,
	getPaymentChannelInfo,
	getSignatureWallet,
	signOffLedgerPayment,
	verifyOffLedgerPayment,
} from '~/lib/xrpl';
import { createTransactionPayload } from '~/lib/xumm';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';

export const paymentChannelRouter = createTRPCRouter({
	createForRoom: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
				amountXRP: z.number().min(0.1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const room = await ctx.db.room.findUnique({
				where: { id: input.roomId },
				include: { creator: true },
			});

			if (!room) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Room not found',
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

			// XRPLから既存のチャネルを確認
			try {
				console.log('🚀 createForRoom - Checking existing channels...');
				console.log('🚀 Sender:', user.walletAddress);
				console.log('🚀 Receiver:', room.creator.walletAddress);

				const channels = await getPaymentChannelsBetweenAddresses(
					user.walletAddress,
					room.creator.walletAddress,
				);

				console.log('🚀 createForRoom - Found channels:', channels.length);
				console.log('🚀 createForRoom - Channels:', JSON.stringify(channels, null, 2));

				// アクティブなチャネルを探す（残高がゼロでないもの）
				const activeChannel = channels.find((ch: any) => {
					console.log('🚀 Evaluating channel:', {
						channel_id: ch.channel_id,
						balance: ch.balance,
						amount: ch.amount,
						isActive: ch.balance !== '0' && ch.amount !== '0',
					});
					return ch.balance !== '0' && ch.amount !== '0';
				});

				if (activeChannel) {
					// 署名ウォレットの公開鍵を取得（16進数形式）
					const signatureWallet = await getSignatureWallet();
					
					// データベースのチャネル情報を更新または作成
					const dbChannel = await ctx.db.paymentChannel.upsert({
						where: {
							channelId: activeChannel.channel_id,
						},
						update: {
							roomId: input.roomId,
							amount: activeChannel.amount,
							status: 'OPEN',
						},
						create: {
							channelId: activeChannel.channel_id,
							roomId: input.roomId,
							senderId: ctx.session.userId,
							receiverId: room.creatorId,
							amount: activeChannel.amount,
							publicKey: signatureWallet.publicKey, // 16進数形式の公開鍵を使用
							status: 'OPEN',
						},
					});

					return { existingChannel: true, channel: dbChannel };
				}
			} catch (error) {
				console.error('Failed to check existing channels from XRPL:', error);
			}

			// XRPLにチャネルがない場合は、データベースも確認
			// ユーザー間の1:1関係でチャネルを検索（roomIdに依存しない）
			const existingDbChannel = await ctx.db.paymentChannel.findFirst({
				where: {
					senderId: ctx.session.userId,
					receiverId: room.creatorId,
					status: 'OPEN',
				},
			});

			if (existingDbChannel) {
				return { existingChannel: true, channel: existingDbChannel };
			}

			const transaction = await createPaymentChannelTransaction({
				senderAddress: user.walletAddress,
				receiverAddress: room.creator.walletAddress,
				amountXRP: input.amountXRP,
			});

			const payload = await createTransactionPayload(transaction);

			return {
				existingChannel: false,
				payload,
				transaction,
			};
		}),

	confirmCreation: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
				channelId: z.string(),
				amount: z.string(),
				publicKey: z.string(), // フロントエンドからは受け取るが使用しない
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

			console.log('🚀 confirmCreation - input:', input);

			// 署名ウォレットの公開鍵を取得（16進数形式）
			const signatureWallet = await getSignatureWallet();

			const channel = await ctx.db.paymentChannel.create({
				data: {
					channelId: input.channelId,
					roomId: input.roomId,
					senderId: ctx.session.userId,
					receiverId: room.creatorId,
					amount: input.amount,
					publicKey: signatureWallet.publicKey, // 16進数形式の公開鍵を使用
				},
			});

			return channel;
		}),

	getChannelInfo: protectedProcedure
		.input(
			z.object({
				channelId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			// Return null for empty channel ID instead of throwing error
			if (!input.channelId || input.channelId.trim() === '') {
				return null;
			}

			const channel = await ctx.db.paymentChannel.findUnique({
				where: { channelId: input.channelId },
			});

			if (!channel) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Payment channel not found',
				});
			}

			// Get channel info from ledger
			const channelInfo = await getPaymentChannelInfo(input.channelId);
			if (!channelInfo) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Payment channel not found on ledger',
				});
			}

			const depositAmount = BigInt(channelInfo.amount);
			const claimedAmount = BigInt(channelInfo.balance);
			const currentOffLedgerAmount = channel.lastAmount ? BigInt(channel.lastAmount) : 0n;
			
			// Available amount = (Deposit - Already Claimed) - Current Off-ledger Amount
			// This represents how much more can be spent in off-ledger transactions
			const totalAvailableForOffLedger = depositAmount - claimedAmount;
			const remainingAvailable = totalAvailableForOffLedger - currentOffLedgerAmount;

			return {
				channelId: channel.channelId,
				depositAmount: dropsToXrp(depositAmount.toString()),
				claimedAmount: dropsToXrp(claimedAmount.toString()),
				currentOffLedgerAmount: dropsToXrp(currentOffLedgerAmount.toString()),
				availableAmount: dropsToXrp(remainingAvailable.toString()),
				totalAvailableForOffLedger: dropsToXrp(totalAvailableForOffLedger.toString()),
			};
		}),

	signPayment: protectedProcedure
		.input(
			z.object({
				channelId: z.string(),
				amountXRP: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			console.log('signPayment input:', input);

			const channel = await ctx.db.paymentChannel.findUnique({
				where: { channelId: input.channelId },
			});

			if (!channel) {
				console.error('Channel not found in database:', input.channelId);
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: `Payment channel not found: ${input.channelId}`,
				});
			}

			if (channel.status !== 'OPEN') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Payment channel is not open',
				});
			}

			try {
				// Get channel info from ledger to get the actual claimed amount
				const channelInfo = await getPaymentChannelInfo(channel.channelId);
				if (!channelInfo) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Payment channel not found on ledger',
					});
				}

				// Use ledger deposit amount for more accurate calculation
				const depositAmount = BigInt(channelInfo.amount);
				const alreadyClaimed = BigInt(channelInfo.balance);
				const cumulativeAmountDrops = BigInt(xrpToDrops(input.amountXRP)); // This is the cumulative off-ledger amount from client
				
				// Calculate available amount for off-ledger transactions
				// After a claim, lastAmount resets to 0, so we can sign up to (deposit - alreadyClaimed)
				const availableAmount = depositAmount - alreadyClaimed;
				
				console.log('💰 Payment channel balance check:', {
					depositAmount: dropsToXrp(depositAmount.toString()),
					alreadyClaimed: dropsToXrp(alreadyClaimed.toString()),
					requestedOffLedgerAmount: dropsToXrp(cumulativeAmountDrops.toString()),
					availableForOffLedger: dropsToXrp(availableAmount.toString()),
					dbLastAmount: channel.lastAmount ? dropsToXrp(channel.lastAmount) : 'null (post-claim)',
				});

				// Check if the off-ledger amount exceeds what's available
				// The off-ledger amount can go up to (deposit - alreadyClaimed)
				if (cumulativeAmountDrops > availableAmount) {
					console.error('Off-ledger amount exceeds available balance:', {
						requestedOffLedgerXRP: input.amountXRP,
						availableForOffLedgerXRP: Number(dropsToXrp(availableAmount.toString())),
						depositXRP: Number(dropsToXrp(depositAmount.toString())),
						alreadyClaimedXRP: Number(dropsToXrp(alreadyClaimed.toString())),
					});
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: `残高不足: オフレジャー額 (${input.amountXRP} XRP) が利用可能額 (${Number(dropsToXrp(availableAmount.toString()))} XRP) を超えています。デポジット: ${Number(dropsToXrp(depositAmount.toString()))} XRP, クレーム済み: ${Number(dropsToXrp(alreadyClaimed.toString()))} XRP`,
					});
				}
				
				// After a claim, DB lastAmount is null and we start from 0
				// The actual last signed amount for validation purposes is:
				// - If DB lastAmount exists: use it
				// - If DB lastAmount is null: we're starting fresh from 0 (post-claim)
				const effectiveLastSignedAmount = channel.lastAmount ? BigInt(channel.lastAmount) : 0n;
				
				// Ensure the cumulative amount is greater than last signed amount
				if (cumulativeAmountDrops <= effectiveLastSignedAmount) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: `Amount must be greater than last signed amount. Requested: ${input.amountXRP} XRP, Last signed: ${Number(dropsToXrp(effectiveLastSignedAmount.toString()))} XRP`,
					});
				}

				// Sign the cumulative amount
				const payment = await signOffLedgerPayment(input.channelId, input.amountXRP);

				console.log('🚀 🚀 🚀 🚀 🚀 payment', payment.amount);

				const signatureWallet = await getSignatureWallet();

				const isValid = await verifyOffLedgerPayment(
					payment.channelId, // Use the normalized channel ID from payment
					input.amountXRP,
					payment.signature,
					signatureWallet.publicKey,
				);

				// console.log('🚀 isValid', isValid);

				if (!isValid) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Invalid payment signature',
					});
				}

				// Update payment channel
				await ctx.db.paymentChannel.update({
					where: { channelId: input.channelId },
					data: {
						lastSignature: payment.signature,
						lastAmount: payment.amount,
					},
				});

				// Update total paid amount in room participant record
				const paymentChannel = await ctx.db.paymentChannel.findUnique({
					where: { channelId: input.channelId },
					include: { room: true },
				});

				if (paymentChannel) {
					// Calculate the increment amount (current cumulative - previous cumulative)
					const previousCumulativeAmount = channel.lastAmount ? Number(dropsToXrp(channel.lastAmount)) : Number(dropsToXrp(alreadyClaimed.toString()));
					const currentCumulativeAmount = input.amountXRP;
					const incrementAmount = currentCumulativeAmount - previousCumulativeAmount;

					console.log('💳 Payment increment calculation:', {
						previousCumulative: previousCumulativeAmount,
						currentCumulative: currentCumulativeAmount,
						increment: incrementAmount,
						requestedPayment: input.amountXRP,
					});

					// Update the participant's total paid amount
					await ctx.db.roomParticipant.updateMany({
						where: {
							roomId: paymentChannel.roomId,
							userId: ctx.session.userId,
						},
						data: {
							totalPaidXrp: {
								increment: incrementAmount,
							},
						},
					});
				}

				return payment;
			} catch (error) {
				console.error('Error in signPayment:', error);
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: error instanceof Error ? error.message : 'Failed to sign payment',
				});
			}
		}),

	verifyPayment: protectedProcedure
		.input(
			z.object({
				channelId: z.string(),
				amountXRP: z.number(),
				signature: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const channel = await ctx.db.paymentChannel.findUnique({
				where: { channelId: input.channelId },
			});

			if (!channel) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Payment channel not found',
				});
			}

			const isValid = await verifyOffLedgerPayment(
				input.channelId,
				input.amountXRP,
				input.signature,
				channel.publicKey,
			);

			if (!isValid) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Invalid payment signature',
				});
			}

			return { valid: true };
		}),

	getChannelsForRoom: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			// ルーム情報を取得してホストを確認
			const room = await ctx.db.room.findUnique({
				where: { id: input.roomId },
			});

			if (!room || room.creatorId !== ctx.session.userId) {
				// ホストでない場合は空配列を返す
				return [];
			}

			// ホストに対するすべてのアクティブなチャネルを取得（ルームに関係なく）
			const channels = await ctx.db.paymentChannel.findMany({
				where: {
					receiverId: ctx.session.userId,
					status: 'OPEN',
				},
				include: {
					sender: true,
				},
			});

			// 現在のルームの参加者のチャネルのみフィルタリング
			const participants = await ctx.db.roomParticipant.findMany({
				where: {
					roomId: input.roomId,
					leftAt: null,
				},
				select: {
					userId: true,
				},
			});

			const participantIds = participants.map(p => p.userId);
			const relevantChannels = channels.filter(ch => participantIds.includes(ch.senderId));

			// Fetch ledger info for each channel
			const channelsWithLedgerInfo = await Promise.all(
				relevantChannels.map(async (channel) => {
					try {
						const channelInfo = await getPaymentChannelInfo(channel.channelId);
						if (channelInfo) {
							const depositAmount = BigInt(channelInfo.amount);
							const claimedAmount = BigInt(channelInfo.balance);
							const currentOffLedgerAmount = channel.lastAmount ? BigInt(channel.lastAmount) : 0n;
							const totalAvailableForOffLedger = depositAmount - claimedAmount;
							const remainingAvailable = totalAvailableForOffLedger - currentOffLedgerAmount;

							return {
								...channel,
								ledgerInfo: {
									depositAmount: dropsToXrp(depositAmount.toString()),
									claimedAmount: dropsToXrp(claimedAmount.toString()),
									currentOffLedgerAmount: dropsToXrp(currentOffLedgerAmount.toString()),
									availableAmount: dropsToXrp(remainingAvailable.toString()),
									totalUsed: dropsToXrp((claimedAmount + currentOffLedgerAmount).toString()),
								},
							};
						}
					} catch (error) {
						console.error('Failed to fetch ledger info for channel:', channel.channelId, error);
					}
					return {
						...channel,
						ledgerInfo: null,
					};
				})
			);

			console.log('🚀 getChannelsForRoom:', {
				hostId: ctx.session.userId,
				totalChannels: channels.length,
				relevantChannels: relevantChannels.length,
				participantIds,
			});

			return channelsWithLedgerInfo;
		}),

	getMyChannelForRoom: protectedProcedure
		.input(
			z.object({
				roomId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			// ルームとユーザー情報を取得
			const room = await ctx.db.room.findUnique({
				where: { id: input.roomId },
				include: { creator: true },
			});

			console.log('🚀 getMyChannelForRoom - room:', room);

			if (!room) {
				console.log('Room not found');
				return null;
			}

			const user = await ctx.db.user.findUnique({
				where: { id: ctx.session.userId },
			});

			console.log('🚀 getMyChannelForRoom - user:', user?.walletAddress);
			console.log('🚀 getMyChannelForRoom - room creator:', room.creator.walletAddress);

			if (!user) {
				console.log('User not found');
				return null;
			}

			// XRPLから実際のチャネル情報を取得
			try {
				console.log('🚀 Fetching channels from XRPL...');
				console.log('🚀 Sender (user):', user.walletAddress);
				console.log('🚀 Receiver (host):', room.creator.walletAddress);

				const channels = await getPaymentChannelsBetweenAddresses(
					user.walletAddress,
					room.creator.walletAddress,
				);

				console.log(
					'🚀 getMyChannelForRoom - channels from XRPL:',
					JSON.stringify(channels, null, 2),
				);
				console.log('🚀 getMyChannelForRoom - channels count:', channels.length);

				const activeChannel = channels.find((ch: any) => {
					console.log('Checking channel:', {
						channel_id: ch.channel_id,
						status: ch.status,
						amount: ch.amount,
						balance: ch.balance,
						destination_account: ch.destination_account,
					});
					// デバッグ：各チャネルの宛先を確認
					console.log(
						'Channel destination matches?',
						ch.destination_account === room.creator.walletAddress,
					);
					return ch.status !== 'CLOSED';
				});

				console.log(
					'🚀 getMyChannelForRoom - activeChannel:',
					activeChannel ? JSON.stringify(activeChannel, null, 2) : 'null',
				);

				if (activeChannel) {
					// 署名ウォレットの公開鍵を取得（16進数形式）
					const signatureWallet = await getSignatureWallet();
					
					// データベースのチャネル情報を更新または作成
					const dbChannel = await ctx.db.paymentChannel.upsert({
						where: {
							channelId: activeChannel.channel_id,
						},
						update: {
							amount: activeChannel.amount,
							status: 'OPEN',
							publicKey: signatureWallet.publicKey, // 常に正しい16進数形式を使用
						},
						create: {
							channelId: activeChannel.channel_id,
							roomId: input.roomId,
							senderId: ctx.session.userId,
							receiverId: room.creatorId,
							amount: activeChannel.amount,
							publicKey: signatureWallet.publicKey, // 16進数形式の公開鍵を使用
							status: 'OPEN',
						},
					});

					// 残高チェック（デポジット額から使用済み額を引いた値が正かどうか）
					const depositAmount = BigInt(activeChannel.amount);
					const usedAmount = BigInt(dbChannel.lastAmount || '0');
					const remainingAmount = depositAmount - usedAmount;

					console.log('🚀 Channel balance check:', {
						deposit: depositAmount.toString(),
						used: usedAmount.toString(),
						remaining: remainingAmount.toString(),
						hasBalance: remainingAmount > 0n,
					});

					// チャネルが存在する場合は、残高がゼロでも返す
					// UIで適切にデポジット追加を促すため
					return dbChannel;
				}
			} catch (error) {
				console.error('Failed to get channels from XRPL:', error);
			}

			// XRPLにチャネルがない場合は、データベースからも確認
			// ユーザー間の1:1関係でチャネルを検索（roomIdに依存しない）
			const dbChannel = await ctx.db.paymentChannel.findFirst({
				where: {
					senderId: ctx.session.userId,
					receiverId: room.creatorId,
					status: 'OPEN',
				},
			});

			return dbChannel;
		}),

	claimChannel: protectedProcedure
		.input(
			z.object({
				channelId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const channel = await ctx.db.paymentChannel.findUnique({
				where: { channelId: input.channelId },
				include: {
					receiver: true,
				},
			});

			if (!channel) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Payment channel not found',
				});
			}

			if (channel.receiverId !== ctx.session.userId) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only receiver can claim the channel',
				});
			}

			if (!channel.lastSignature || !channel.lastAmount) {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'No payments to claim',
				});
			}

			try {
				// Get channel info from ledger first
				const channelInfo = await getPaymentChannelInfo(channel.channelId);
				if (!channelInfo) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'Payment channel not found on ledger',
					});
				}

				// Log the exact values being used for the claim
				console.log('🔍 Claim parameters:', {
					channelId: channel.channelId,
					lastAmount: channel.lastAmount,
					lastSignature: channel.lastSignature?.substring(0, 20) + '...',
					publicKeyFromDB: channel.publicKey,
					receiverAddress: channel.receiver.walletAddress,
					ledgerInfo: {
						depositAmount: dropsToXrp(channelInfo.amount),
						claimedAmount: dropsToXrp(channelInfo.balance),
						availableAmount: dropsToXrp((BigInt(channelInfo.amount) - BigInt(channelInfo.balance)).toString()),
					},
				});
				
				// Check if there's actually anything to claim
				const depositAmount = BigInt(channelInfo.amount);
				const alreadyClaimed = BigInt(channelInfo.balance);
				const signedAmount = BigInt(channel.lastAmount);
				
				if (signedAmount <= alreadyClaimed) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: `Nothing to claim. Signed amount (${dropsToXrp(signedAmount.toString())} XRP) is less than or equal to already claimed amount (${dropsToXrp(alreadyClaimed.toString())} XRP)`,
					});
				}
				
				// Get signature wallet to compare public keys
				const signatureWallet = await getSignatureWallet();
				console.log('🔍 Signature wallet comparison:', {
					dbPublicKey: channel.publicKey,
					walletPublicKey: signatureWallet.publicKey,
					match: channel.publicKey.toUpperCase() === signatureWallet.publicKey.toUpperCase(),
				});
				
				const transaction = await createPaymentChannelClaimTransaction({
					channelId: channel.channelId,
					balance: channel.lastAmount,
					amount: channel.lastAmount,
					signature: channel.lastSignature,
					publicKey: channel.publicKey,
					accountAddress: channel.receiver.walletAddress,
				});

				console.log('Created claim transaction:', JSON.stringify(transaction, null, 2));
				
				// Validate transaction before sending to Xumm
				if (!transaction.Account || !transaction.Channel || !transaction.Balance) {
					throw new Error(`Invalid transaction: missing required fields - Account: ${transaction.Account}, Channel: ${transaction.Channel}, Balance: ${transaction.Balance}`);
				}

				try {
					const payload = await createTransactionPayload(transaction);
					console.log('Created Xumm payload:', JSON.stringify(payload, null, 2));
					return { payload };
				} catch (xummError) {
					console.error('Xumm API error details:', {
						error: xummError,
						message: xummError instanceof Error ? xummError.message : 'Unknown error',
						stack: xummError instanceof Error ? xummError.stack : undefined,
					});
					
					// Check if it's an API key issue
					if (xummError instanceof Error && xummError.message.includes('not configured')) {
						throw new TRPCError({
							code: 'INTERNAL_SERVER_ERROR',
							message: 'Xumm API認証情報が設定されていません。環境変数XUMM_API_KEYとXUMM_API_SECRETを確認してください。',
						});
					}
					
					throw xummError;
				}
			} catch (error) {
				console.error('Error creating claim payload:', error);
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to create claim payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	closeChannel: protectedProcedure
		.input(
			z.object({
				channelId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const channel = await ctx.db.paymentChannel.findUnique({
				where: { channelId: input.channelId },
			});

			if (!channel) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Payment channel not found',
				});
			}

			if (channel.receiverId !== ctx.session.userId) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only receiver can close the channel',
				});
			}

			await ctx.db.paymentChannel.update({
				where: { channelId: input.channelId },
				data: {
					status: 'CLOSING',
				},
			});

			return { success: true };
		}),

	addDeposit: protectedProcedure
		.input(
			z.object({
				channelId: z.string(),
				additionalAmountXRP: z.number().min(0.1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const channel = await ctx.db.paymentChannel.findUnique({
				where: { channelId: input.channelId },
				include: {
					receiver: true,
				},
			});

			if (!channel) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Payment channel not found',
				});
			}

			if (channel.senderId !== ctx.session.userId) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only sender can add deposit',
				});
			}

			if (channel.status !== 'OPEN') {
				throw new TRPCError({
					code: 'BAD_REQUEST',
					message: 'Payment channel is not open',
				});
			}

			// PaymentChannelFundトランザクションを作成
			const user = await ctx.db.user.findUnique({
				where: { id: ctx.session.userId },
			});

			if (!user) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'User not found',
				});
			}

			const transaction = {
				TransactionType: 'PaymentChannelFund' as const,
				Account: user.walletAddress,
				Channel: channel.channelId,
				Amount: xrpToDrops(input.additionalAmountXRP),
			};

			const payload = await createTransactionPayload(transaction);

			return { payload };
		}),

	batchCloseChannels: protectedProcedure
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
					message: 'Only room creator can close channels',
				});
			}

			// ホストに対するすべてのアクティブなチャネルを取得（roomIdに依存しない）
			const channels = await ctx.db.paymentChannel.findMany({
				where: {
					receiverId: ctx.session.userId,
					status: 'OPEN',
				},
			});

			const results = [];

			for (const channel of channels) {
				if (channel.lastSignature && channel.lastAmount) {
					const user = await ctx.db.user.findUnique({
						where: { id: ctx.session.userId },
					});

					if (user) {
						// Get channel info from ledger to check if there's anything to claim
						const channelInfo = await getPaymentChannelInfo(channel.channelId);
						if (!channelInfo) {
							console.log(`Channel ${channel.channelId} not found on ledger, skipping`);
							continue;
						}

						// Check if there's actually anything to claim
						const alreadyClaimed = BigInt(channelInfo.balance);
						const signedAmount = BigInt(channel.lastAmount);
						
						if (signedAmount <= alreadyClaimed) {
							console.log(`Channel ${channel.channelId}: Nothing to claim (signed: ${dropsToXrp(signedAmount.toString())}, claimed: ${dropsToXrp(alreadyClaimed.toString())})`);
							continue;
						}

						const transaction = await createPaymentChannelClaimTransaction({
							channelId: channel.channelId,
							balance: channel.lastAmount,
							amount: channel.lastAmount,
							signature: channel.lastSignature,
							publicKey: channel.publicKey,
							accountAddress: user.walletAddress,
						});

						// Closeフラグを追加してチャネルを閉じる
						const transactionWithClose = {
							...transaction,
							Close: true,
						};

						console.log('Transaction with close flag:', JSON.stringify(transactionWithClose, null, 2));

						const payload = await createTransactionPayload(transactionWithClose);

						results.push({
							channelId: channel.channelId,
							payload,
						});
					}
				}
			}

			return { results };
		}),

	getAllReceivedChannels: protectedProcedure.query(async ({ ctx }) => {
		// Get all channels where the current user is the receiver
		const channels = await ctx.db.paymentChannel.findMany({
			where: {
				receiverId: ctx.session.userId,
				status: 'OPEN',
			},
			include: {
				sender: true,
				room: true,
			},
			orderBy: [
				{ lastAmount: 'desc' },
				{ createdAt: 'desc' },
			],
		});

		// Check each channel's existence on XRPL and clean up closed channels
		const { checkChannelExists } = await import('~/lib/xrpl');
		const activeChannels = [];
		
		for (const channel of channels) {
			try {
				const exists = await checkChannelExists(channel.channelId);
				if (!exists) {
					// Channel no longer exists on XRPL, delete from database
					console.log('🧹 Cleaning up closed channel:', channel.channelId);
					await ctx.db.paymentChannel.delete({
						where: { channelId: channel.channelId },
					});
				} else {
					activeChannels.push(channel);
				}
			} catch (error) {
				console.error('Error checking channel:', channel.channelId, error);
				// Keep the channel if we can't verify its status
				activeChannels.push(channel);
			}
		}

		return activeChannels;
	}),

	confirmClaimAndReset: protectedProcedure
		.input(
			z.object({
				channelId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const channel = await ctx.db.paymentChannel.findUnique({
				where: { channelId: input.channelId },
			});

			if (!channel) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Payment channel not found',
				});
			}

			if (channel.receiverId !== ctx.session.userId) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Only receiver can confirm claim',
				});
			}

			// Reset lastSignature and lastAmount after successful claim
			await ctx.db.paymentChannel.update({
				where: { channelId: input.channelId },
				data: {
					lastSignature: null,
					lastAmount: null,
				},
			});

			console.log('✅ Payment channel lastSignature and lastAmount reset after successful claim:', input.channelId);

			return { success: true };
		}),
});
