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
			console.error('Failed to sign payment:', error);
			// 支払いタイマーを停止
			if (paymentIntervalRef.current) {
				clearInterval(paymentIntervalRef.current);
				paymentIntervalRef.current = null;
				console.error('Payment timer stopped due to error');
			}
			
			// 残高不足エラーの場合は、onBalanceInsufficientコールバックを呼び出す
			if (error.message && (
				error.message.includes('残高不足') || 
				error.message.includes('Amount must be greater than last signed amount')
			)) {
				if (onBalanceInsufficient) {
					console.log('Calling onBalanceInsufficient callback due to payment error');
					onBalanceInsufficient();
				}
			}
		},
	});

	const { mutateAsync: createPaymentChannel } = api.paymentChannel.createForRoom.useMutation();

	const { mutateAsync: addDeposit } = api.paymentChannel.addDeposit.useMutation();

	const startPaymentTimer = useCallback(
		(channelId: string, existingAmountXRP?: number, resumeFromSeconds?: number) => {
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
			} else if (existingAmountXRP && existingAmountXRP > 0) {
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
					
					// 使用済み額は、DBの値と現在のlastSignedAmountの大きい方を使用
					const actualUsedAmountXRP = Math.max(dbLastAmountXRP, lastSignedAmount);
					const availableBalanceXRP = totalDepositXRP - actualUsedAmountXRP;

					// 次の支払い額が残高を超える場合は停止
					// roundedXrpは累積額なので、新規支払い額は roundedXrp - actualUsedAmountXRP
					const newPaymentAmount = roundedXrp - actualUsedAmountXRP;
					
					// より厳密なチェック: 次の署名が不可能な場合も停止
					// XRPLの仕様により、署名金額は単調増加する必要がある
					if (newPaymentAmount > availableBalanceXRP || 
					    roundedXrp > totalDepositXRP ||
					    roundedXrp <= actualUsedAmountXRP) {
						console.warn('Payment timer stopped - insufficient balance or invalid amount:', {
							requestedAmount: roundedXrp,
							totalDeposit: totalDepositXRP,
							actualUsedAmount: actualUsedAmountXRP,
							availableBalance: availableBalanceXRP,
							newPaymentAmount,
							dbLastAmount: dbLastAmountXRP,
							localLastSignedAmount: lastSignedAmount,
							wouldBeValid: roundedXrp > actualUsedAmountXRP,
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
					const remainingMinutes = availableBalanceXRP / (room.xrpPerMinute || 0.01);
					if (remainingMinutes < 1) {
						console.warn('Low balance warning - less than 1 minute remaining:', {
							currentAmount: roundedXrp,
							totalDeposit: totalDepositXRP,
							actualUsedAmount: actualUsedAmountXRP,
							availableBalance: availableBalanceXRP,
							remainingMinutes,
						});
					}
				}

				// Only sign if the amount is greater than the last signed amount
				if (roundedXrp > lastSignedAmount) {
					console.log('Signing payment:', {
						channelId,
						amountXRP: roundedXrp,
						totalSeconds,
						xrpPerMinute: room.xrpPerMinute,
						lastSignedAmount,
					});

					lastSignedAmount = roundedXrp;

					signPayment({
						channelId,
						amountXRP: roundedXrp,
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
