import { useCallback, useRef } from 'react';
import { dropsToXrp } from 'xrpl';
import { api } from '~/trpc/react';

interface UsePaymentChannelProps {
	roomId: string;
	userId: string | null;
	room:
		| {
				id: string;
				creatorId: string;
				xrpPerMinute: number | null;
		  }
		| null
		| undefined;
	enabled: boolean;
	onSecondsUpdate?: (seconds: number) => void;
	onBalanceInsufficient?: () => void; // 残高不足時のコールバック
}

export function usePaymentChannel({
	roomId,
	userId,
	room,
	enabled,
	onSecondsUpdate,
	onBalanceInsufficient,
}: UsePaymentChannelProps) {
	const paymentIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const totalPaidSecondsRef = useRef<number>(0);
	const lastSignedAmountRef = useRef<number>(0);

	// 自分の支払いチャネルを取得
	const {
		data: myChannel,
		refetch: refetchMyChannel,
		isLoading: isLoadingChannel,
	} = api.paymentChannel.getMyChannelForRoom.useQuery(
		{ roomId },
		{
			enabled: enabled && !!userId && !!room && userId !== room.creatorId,
			refetchInterval: 5000,
			refetchIntervalInBackground: true,
			refetchOnWindowFocus: true,
		},
	);


	// ホストの場合はリスナーからの支払いチャネルを取得
	const { data: incomingChannels } = api.paymentChannel.getChannelsForRoom.useQuery(
		{ roomId },
		{
			enabled: enabled && !!userId && !!room && userId === room.creatorId,
			refetchInterval: 1000,
		},
	);

	const { mutate: signPayment } = api.paymentChannel.signPayment.useMutation({
		onError: (error) => {
			console.error('❌ Failed to sign payment:', error);
			console.error('Error details:', {
				message: error.message,
				data: error.data,
			});
			
			// 支払いタイマーを停止
			if (paymentIntervalRef.current) {
				clearInterval(paymentIntervalRef.current);
				paymentIntervalRef.current = null;
				console.error('Payment timer stopped due to error');
			}
			
			// 残高不足エラーの場合のみ、onBalanceInsufficientコールバックを呼び出す
			if (error.message && error.message.includes('残高不足')) {
				console.error('⚠️ Balance insufficient detected from server');
				if (onBalanceInsufficient) {
					console.log('Calling onBalanceInsufficient callback due to payment error');
					onBalanceInsufficient();
				}
			} else {
				console.log('❗ Error is not balance-related:', error.message);
			}
		},
	});

	const { mutateAsync: createPaymentChannel } = api.paymentChannel.createForRoom.useMutation();

	const { mutateAsync: addDeposit } = api.paymentChannel.addDeposit.useMutation();

	const startPaymentTimer = useCallback(
		async (channelId: string, existingAmountXRP?: number, resumeFromSeconds?: number) => {
			if (!channelId || !room?.xrpPerMinute) {
				console.error('Cannot start payment timer without channel ID or xrpPerMinute');
				return;
			}

			// Clear any existing timer first
			if (paymentIntervalRef.current) {
				clearInterval(paymentIntervalRef.current);
				paymentIntervalRef.current = null;
			}

			// Calculate initial seconds based on existing payment amount or resume point
			let totalSeconds = 0;
			let lastSignedAmount = existingAmountXRP || 0;
			let lastKnownDbAmount = existingAmountXRP || 0; // Track the DB amount separately
			
			// Update the ref with initial value
			lastSignedAmountRef.current = lastSignedAmount;
			
			// First, get the current channel state to check if we need ledger balance
			const { data: initialChannelData } = await refetchMyChannel();
			if (initialChannelData && !initialChannelData.lastAmount && existingAmountXRP === 0) {
				// DB lastAmount is null and no existing amount provided
				// This happens after a claim - off-ledger transactions start from 0
				console.log('📊 DB lastAmount is null after claim, starting from 0');
				
				// After a claim, we start fresh from 0
				lastSignedAmount = 0;
				totalSeconds = 0;
				console.log('🔄 Starting fresh after claim - off-ledger amount starts from 0');
			} else if (initialChannelData) {
				// Normal case - use DB data
				const dbLastAmountXRP = initialChannelData.lastAmount ? Number(dropsToXrp(initialChannelData.lastAmount)) : 0;
				
				// If DB shows 0 but existingAmountXRP has a value, use it
				if (dbLastAmountXRP === 0 && existingAmountXRP && existingAmountXRP > 0) {
					lastSignedAmount = existingAmountXRP;
					lastKnownDbAmount = existingAmountXRP;
					console.log('💰 Using provided existingAmountXRP:', {
						existingAmountXRP,
						dbLastAmountXRP,
						lastSignedAmount
					});
				}
			}
			
			console.log('🚀 Starting payment timer:', {
				channelId,
				existingAmountXRP,
				resumeFromSeconds,
				initialLastSignedAmount: lastSignedAmount,
				xrpPerMinute: room?.xrpPerMinute,
			});

			// If resuming from a specific second count (after deposit), use that
			if (resumeFromSeconds !== undefined && resumeFromSeconds > 0) {
				totalSeconds = resumeFromSeconds;
				// Keep the last signed amount as is when resuming
				// Don't recalculate it based on seconds
				console.log('Resuming payment timer from seconds:', {
					resumeFromSeconds,
					lastSignedAmount,
					xrpPerMinute: room.xrpPerMinute,
				});
			} else if (existingAmountXRP && existingAmountXRP > 0 && totalSeconds === 0) {
				// Only calculate totalSeconds if not already set by ledger balance check
				const baseSeconds = (existingAmountXRP / room.xrpPerMinute) * 60;
				totalSeconds = Math.ceil(baseSeconds) + 1;

				const verifyAmount = (totalSeconds / 60) * room.xrpPerMinute;
				const verifyRounded = Math.round(verifyAmount * 1000000) / 1000000;

				console.log('Resuming payment timer from existing amount:', {
					existingAmountXRP,
					calculatedSeconds: totalSeconds,
					baseSeconds,
					xrpPerMinute: room.xrpPerMinute,
					verifyAmount: verifyRounded,
					willBeGreater: verifyRounded > existingAmountXRP,
				});

				// If still not greater, add more seconds
				while (verifyRounded <= existingAmountXRP && totalSeconds < baseSeconds + 10) {
					totalSeconds++;
					const newAmount = (totalSeconds / 60) * room.xrpPerMinute;
					const newRounded = Math.round(newAmount * 1000000) / 1000000;
					if (newRounded > existingAmountXRP) {
						console.log('Added extra seconds to ensure amount is greater:', totalSeconds);
						break;
					}
				}
			}

			// Store the current total seconds
			totalPaidSecondsRef.current = totalSeconds;

			const interval = setInterval(async () => {
				totalSeconds += 1;
				totalPaidSecondsRef.current = totalSeconds;

				// Update seconds in parent component
				if (onSecondsUpdate) {
					onSecondsUpdate(totalSeconds);
				}


				// 1秒ごとに支払い署名を送信（仕様通り）
				const totalXrp = (totalSeconds / 60) * (room.xrpPerMinute || 0);
				// Round to 6 decimal places (XRP precision limit)
				const roundedXrp = Math.round(totalXrp * 1000000) / 1000000;

				// 残高チェックを先に実行（支払い前に確認）
				// 最新のチャネル情報を取得
				const { data: latestChannel } = await refetchMyChannel();
				if (latestChannel) {
					const totalDepositXRP = Number(dropsToXrp(latestChannel.amount));
					
					// データベースのlastAmountを使用して正確な使用済み額を取得
					const dbLastAmountXRP = latestChannel.lastAmount ? Number(dropsToXrp(latestChannel.lastAmount)) : 0;
					
					// DBの値が更新されていたら、lastKnownDbAmountを更新
					if (dbLastAmountXRP > lastKnownDbAmount) {
						lastKnownDbAmount = dbLastAmountXRP;
						// lastSignedAmountも更新（DBに反映されたので）
						if (dbLastAmountXRP >= lastSignedAmount) {
							lastSignedAmount = dbLastAmountXRP;
						}
					}
					
					// 現在の累積署名額（roundedXrp）が総デポジット額を超える場合は停止
					if (roundedXrp > totalDepositXRP) {
						console.warn('Payment timer stopped - would exceed deposit:', {
							nextCumulativeAmount: roundedXrp,
							totalDeposit: totalDepositXRP,
							currentLastAmount: dbLastAmountXRP,
							localLastSignedAmount: lastSignedAmount,
						});
						clearInterval(interval);
						paymentIntervalRef.current = null;

						// 残高不足時のコールバックを実行（ホストの音声停止など）
						if (onBalanceInsufficient) {
							onBalanceInsufficient();
						}
						return;
					}

					// 残高が少なくなってきた場合の警告（残り1分以下）
					const availableBalanceXRP = totalDepositXRP - dbLastAmountXRP;
					const remainingMinutes = availableBalanceXRP / (room.xrpPerMinute || 0.01);
					if (remainingMinutes < 1 && remainingMinutes >= 0) {
						console.warn('Low balance warning - less than 1 minute remaining:', {
							currentAmount: roundedXrp,
							totalDeposit: totalDepositXRP,
							usedAmount: dbLastAmountXRP,
							availableBalance: availableBalanceXRP,
							remainingMinutes,
						});
					}
				}

				// Only sign if the amount is greater than the last signed amount
				if (roundedXrp > lastSignedAmount) {
					// Calculate the incremental payment amount (new total - last signed)
					const incrementalPayment = roundedXrp - lastSignedAmount;
					// Round to 6 decimal places to avoid floating point precision issues
					const roundedIncrementalPayment = Math.round(incrementalPayment * 1000000) / 1000000;
					
					console.log('💰 Signing payment:', {
						channelId,
						cumulativeAmountXRP: roundedXrp,
						incrementalAmountXRP: roundedIncrementalPayment,
						totalSeconds,
						xrpPerMinute: room.xrpPerMinute,
						lastSignedAmount,
						difference: roundedXrp - lastSignedAmount,
					});

					lastSignedAmount = roundedXrp;
					lastSignedAmountRef.current = roundedXrp; // Update ref

					signPayment({
						channelId,
						amountXRP: roundedXrp,  // Send cumulative amount
					});
				} else {
					console.log('Skipping payment signature (amount not increased yet):', {
						currentAmount: roundedXrp,
						lastSignedAmount,
						totalSeconds,
					});
				}
			}, 1000);

			paymentIntervalRef.current = interval;

			return totalSeconds;
		},
		[room?.xrpPerMinute, signPayment, onSecondsUpdate, onBalanceInsufficient, refetchMyChannel],
	);

	const stopPaymentTimer = useCallback(() => {
		if (paymentIntervalRef.current) {
			clearInterval(paymentIntervalRef.current);
			paymentIntervalRef.current = null;
			console.log('Payment timer stopped');
		}
	}, []);

	// Get current paid seconds
	const getCurrentPaidSeconds = useCallback(() => {
		return totalPaidSecondsRef.current;
	}, []);

	return {
		myChannel,
		refetchMyChannel,
		isLoadingChannel,
		incomingChannels,
		createPaymentChannel,
		addDeposit,
		startPaymentTimer,
		stopPaymentTimer,
		paymentIntervalRef,
		getCurrentPaidSeconds,
	};
}
