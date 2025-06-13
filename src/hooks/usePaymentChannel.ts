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

			const interval = setInterval(() => {
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
				if (myChannel) {
					const totalDepositXRP = Number(dropsToXrp(myChannel.amount));

					// 現在の使用可能残高を計算
					const usedAmountXRP = lastSignedAmount;
					const availableBalanceXRP = totalDepositXRP - usedAmountXRP;

					// 次の支払い額が残高を超える場合は停止
					if (roundedXrp > totalDepositXRP) {
						console.warn('Payment timer stopped - insufficient balance:', {
							requestedAmount: roundedXrp,
							totalDeposit: totalDepositXRP,
							usedAmount: usedAmountXRP,
							availableBalance: availableBalanceXRP,
						});
						clearInterval(interval);
						paymentIntervalRef.current = null;

						// 残高不足時のコールバックを実行（ホストの音声停止など）
						if (onBalanceInsufficient) {
							onBalanceInsufficient();
						}
						return;
					}

					// 残高が少なくなってきた場合の警告（残り5分以下）
					const nextPaymentAmount = roundedXrp + (room.xrpPerMinute || 0) / 60; // 次の1分後の支払い額
					if (nextPaymentAmount > totalDepositXRP) {
						console.warn('Low balance warning - will run out soon:', {
							currentAmount: roundedXrp,
							nextAmount: nextPaymentAmount,
							totalDeposit: totalDepositXRP,
						});
						return;
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
		[room?.xrpPerMinute, signPayment, onSecondsUpdate, myChannel, onBalanceInsufficient],
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
