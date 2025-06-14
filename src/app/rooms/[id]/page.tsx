'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dropsToXrp, xrpToDrops } from 'xrpl';
// import { AudioLevelIndicator } from '~/components/AudioLevelIndicator';
import { generateNumericUid } from '~/lib/uid';
import { AudioControls } from '~/components/room/AudioControls';
import { AudioLevelDisplay } from '~/components/room/AudioLevelDisplay';
import { DepositAddition } from '~/components/room/DepositAddition';
import { HostControls } from '~/components/room/HostControls';
import { ParticipantsList } from '~/components/room/ParticipantsList';
import { PaymentChannelCreation } from '~/components/room/PaymentChannelCreation';
import { PaymentStatusDisplay } from '~/components/room/PaymentStatusDisplay';
import { RoomInfo } from '~/components/room/RoomInfo';
import { SpeakPermissionNotification } from '~/components/room/SpeakPermissionNotification';
import { NFTTicketPurchase } from '~/components/room/NFTTicketPurchase';
import { env } from '~/env';
import { useAgora } from '~/hooks/useAgora';
import { usePaymentChannel } from '~/hooks/usePaymentChannel';
import { useRoomMonitoring } from '~/hooks/useRoomMonitoring';
import { useSpeakPermissionMonitor } from '~/hooks/useSpeakPermissionMonitor';
import type { ParticipantWithAllFields } from '~/lib/types';
import { api } from '~/trpc/react';

export default function RoomPage() {
	const params = useParams();
	const router = useRouter();
	const roomId = params.id as string;

	const [isJoining, setIsJoining] = useState(false);
	const [paymentChannelId, setPaymentChannelId] = useState<string | null>(null);
	const [isCheckingAuth, setIsCheckingAuth] = useState(true);
	const [isCreatingChannel, setIsCreatingChannel] = useState(false);
	const [totalPaidSeconds, setTotalPaidSeconds] = useState(0);
	const [xummQrUrl, setXummQrUrl] = useState<string | null>(null);
	const [xummQrCode, setXummQrCode] = useState<string | null>(null);
	const [channelAmountXRP, setChannelAmountXRP] = useState<number>(0);
	const [userId, setUserId] = useState<string | null>(null);
	const [isAddingDeposit, setIsAddingDeposit] = useState(false);
	const [depositAmountXRP, setDepositAmountXRP] = useState<number>(0);
	const [revokedUsersRef] = useState(() => new Set<string>());
	const [isBalanceInsufficient, setIsBalanceInsufficient] = useState(false);
	const [hasNFTAccess, setHasNFTAccess] = useState<boolean | null>(null);
	const [isCheckingNFTAccess, setIsCheckingNFTAccess] = useState(false);

	// ログインチェック
	useEffect(() => {
		if (typeof window !== 'undefined') {
			const storedUserId = localStorage.getItem('userId');
			setUserId(storedUserId);
			if (!storedUserId) {
				router.push('/auth/signin');
			} else {
				setIsCheckingAuth(false);
			}
		}
	}, [router]);

	const {
		data: room,
		isLoading,
		refetch: refetchRoom,
	} = api.room.get.useQuery(
		{ id: roomId },
		{
			refetchInterval: 2000, // 2秒ごとに更新
		},
	);

	// Calculate derived values early
	const isHost = userId && room ? userId === room.creatorId : false;
	const participant = room?.participants.find((p) => p.userId === userId) as
		| ParticipantWithAllFields
		| undefined;
	const [agoraToken, setAgoraToken] = useState<string | null>(null);

	// Check NFT ticket access
	const { data: nftAccessData, refetch: refetchNFTAccess } = api.nftTicket.checkAccess.useQuery(
		{ roomId },
		{
			enabled: !!room && room.paymentMode === 'NFT_TICKET' && !!userId,
		}
	);

	// Update access state when data changes
	useEffect(() => {
		console.log('NFT Access Data Update:', {
			nftAccessData,
			isCheckingNFTAccess,
			hasNFTAccess,
			roomId,
			userId,
			isHost
		});
		
		if (nftAccessData !== undefined) {
			setHasNFTAccess(nftAccessData.hasAccess);
			setIsCheckingNFTAccess(false);
			console.log('NFT Access State Updated:', {
				hasAccess: nftAccessData.hasAccess,
				tokenId: nftAccessData.tokenId
			});
		}
	}, [nftAccessData]);

	// Update NFT access check when room data changes
	useEffect(() => {
		if (room && room.paymentMode === 'NFT_TICKET' && userId && !isHost) {
			// Only set checking if we don't have data yet
			if (hasNFTAccess === null) {
				setIsCheckingNFTAccess(true);
			}
			// Force refetch when room/user changes
			refetchNFTAccess();
		}
	}, [room, userId, isHost, hasNFTAccess, refetchNFTAccess]);

	// Check if host is in the room (for non-host users) - will be defined after useAgora hook
	const [hostInRoomState, setHostInRoomState] = useState<boolean>(true);

	// Payment channel hook
	const {
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
	} = usePaymentChannel({
		roomId,
		userId,
		room,
		enabled: !!room,
		onSecondsUpdate: setTotalPaidSeconds,
		onBalanceInsufficient: async () => {
			console.warn('🚨 Balance insufficient - stopping all audio and revoking permissions');
			
			// 残高不足状態を設定
			setIsBalanceInsufficient(true);
			
			// 1. スピーカー権限を持っている場合は即座に剥奪（サーバー側で処理）
			if (!isHost && userId) {
				try {
					// 新しいAPIを使用して自分のスピーカー権限を放棄
					releaseSpeakPermission({ roomId });
					console.log('🔄 Releasing speaker permission due to insufficient balance');
				} catch (error) {
					console.error('❌ Failed to revoke speaker permission:', error);
				}
			}
			
			// 2. 自分が音声を配信している場合は完全に停止
			if (isPublished && !isHost) {
				try {
					await unpublishAudio();
					console.log('✅ Own audio stopped due to insufficient balance');
				} catch (error) {
					console.error('❌ Failed to stop own audio:', error);
				}
			}
			
			// 3. Agoraチャンネルから一時的に切断して音声送信を完全に停止
			if (isJoined && !isHost) {
				try {
					await leave();
					console.log('✅ Left Agora channel due to insufficient balance');
					
					// 少し待ってから再接続（リスナーとして）
					setTimeout(async () => {
						try {
							if (agoraToken) {
								await join(agoraToken);
								console.log('✅ Rejoined as listener due to insufficient balance');
							}
						} catch (error) {
							console.error('❌ Failed to rejoin as listener:', error);
						}
					}, 1000);
				} catch (error) {
					console.error('❌ Failed to leave Agora channel:', error);
				}
			}
			
			// 4. ホストからの音声を完全に停止
			try {
				await pauseRemoteAudio();
				console.log('✅ Remote audio stopped due to insufficient balance');
			} catch (error) {
				console.error('❌ Failed to stop remote audio:', error);
			}
			
			alert('残高が不足したため、音声を停止し、発言権を取り消しました。デポジットを追加してください。');
		},
	});

	const { mutate: joinRoom } = api.room.join.useMutation({
		onSuccess: () => {
			// 参加成功時にルーム情報を再取得
			refetchRoom();
		},
	});
	const { mutate: leaveRoom } = api.room.leave.useMutation({
		onSuccess: () => {
			// 退出成功時にルーム情報を再取得
			refetchRoom();
		},
	});
	const { mutate: startRoom } = api.room.start.useMutation();
	const { mutate: endRoom } = api.room.end.useMutation();
	const { mutateAsync: getAgoraToken } = api.room.getAgoraToken.useMutation();
	const { mutate: requestSpeak } = api.room.requestSpeak.useMutation({
		onSuccess: () => {
			refetchRoom();
			alert('発言権をリクエストしました');
		},
	});
	const { mutate: grantSpeak } = api.room.grantSpeak.useMutation({
		onSuccess: () => {
			refetchRoom();
		},
	});
	const { mutate: revokeSpeak } = api.room.revokeSpeak.useMutation({
		onSuccess: () => {
			refetchRoom();
		},
	});
	const { mutate: releaseSpeakPermission } = api.room.releaseSpeakPermission.useMutation({
		onSuccess: () => {
			refetchRoom();
			console.log('✅ Released speak permission successfully');
		},
		onError: (error) => {
			console.error('❌ Failed to release speak permission:', error);
		},
	});

	// Determine if user should be able to speak (host or listener with permission)
	const shouldBeHost = participant?.role === 'HOST' || isHost;
	const hasCanSpeak = participant && 'canSpeak' in participant ? (participant as any).canSpeak : false;
	const canSpeak = shouldBeHost || hasCanSpeak;

	const {
		join,
		leave,
		toggleMute,
		isMuted,
		isJoined,
		remoteUsers,
		publishAudio,
		unpublishAudio,
		isPublished,
		connectionState,
		localAudioLevel,
		remoteAudioLevels,
		pauseRemoteAudio,
		resumeRemoteAudio,
		isRemoteAudioPaused,
	} = useAgora({
		channelName: room?.agoraChannelName || '',
		isHost: canSpeak,
		token: agoraToken || undefined,
		uid: userId || undefined,
	});

	// Monitor speak permission changes and handle audio unpublishing
	const { wasRevoked, clearRevoked } = useSpeakPermissionMonitor({
		participant,
		isHost,
		isPublished,
		unpublishAudio,
		userId,
	});

	// ホストの存在状態を監視（remoteUsersとroomの変化を直接監視）
	useEffect(() => {
		if (!room) {
			setHostInRoomState(true); // roomがない場合はデフォルトで許可
			return;
		}
		
		// 自分がホストの場合は常に許可
		if (isHost) {
			setHostInRoomState(true);
			return;
		}
		
		// ホストの参加者情報を取得（leftAtがnullのアクティブな参加者のみ）
		const hostParticipant = room.participants.find((p) => p.role === 'HOST' && p.leftAt === null);
		if (!hostParticipant) {
			console.log('No active host participant found in room');
			setHostInRoomState(false);
			return;
		}
		
		// ホストがDBには存在するが、まだAgoraに接続していない可能性があるため
		// 少し待機時間を設ける（初回参加時）
		if (remoteUsers.length === 0 && !isJoined) {
			console.log('No remote users yet, waiting for connections...');
			// ホストがDBにいる場合は一時的に許可（後で再チェック）
			setHostInRoomState(true);
			return;
		}
		
		// ホストのAgoraでのUIDを計算
		const hostNumericUid = generateNumericUid(hostParticipant.userId);
		
		// remoteUsersからホストを探す
		const hostInAgora = remoteUsers.some((user) => {
			// UIDが数値か文字列かに関わらず比較
			const userUid = typeof user.uid === 'string' ? parseInt(user.uid, 10) : user.uid;
			return userUid === hostNumericUid;
		});
		
		// デバッグ情報の改善
		console.log('Host presence check:', {
			hostUserId: hostParticipant.userId,
			hostNumericUid,
			remoteUsers: remoteUsers.map(u => ({
				uid: u.uid,
				type: typeof u.uid,
				parsedUid: typeof u.uid === 'string' ? parseInt(u.uid, 10) : u.uid,
			})),
			hostInAgora,
			isJoined,
			remoteUsersCount: remoteUsers.length,
		});
		
		// ホストがAgoraチャンネルにいるか、または自分がまだ参加していない場合は許可
		const shouldAllowJoin = hostInAgora || !isJoined;
		setHostInRoomState(shouldAllowJoin);
		
		if (!shouldAllowJoin) {
			console.log('⚠️ Host not found in Agora channel - disabling join button');
		} else if (hostInAgora) {
			console.log('✅ Host found in Agora channel - enabling join button');
		}
	}, [isHost, room, userId, isJoined, remoteUsers]);

	const handleLeaveRoom = useCallback(async () => {
		console.log('🚀 handleLeaveRoom clicked', {
			roomId,
			isJoined,
			paymentIntervalRef: !!paymentIntervalRef.current,
		});

		try {
			console.log('🚀 Stopping payment timer...');
			stopPaymentTimer();
			console.log('✅ Payment timer stopped');

			console.log('🚀 Leaving Agora channel...');
			// leave関数を呼び出し（エラーは内部で処理される）
			await leave();
			console.log('✅ Left Agora channel');

			// Agoraが完全にクリーンアップされるのを待つ
			await new Promise((resolve) => setTimeout(resolve, 500));

			console.log('🚀 Leaving room on server...');
			// サーバー側の処理
			leaveRoom({ roomId });
			console.log('✅ Left room on server');

			console.log('🚀 Navigating to rooms list...');
			// ルーム一覧に戻る
			router.push('/rooms');
		} catch (error) {
			console.error('❌ Failed to leave room:', error);
			alert(`退室に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
			// エラーが発生してもルーム一覧に戻る
			router.push('/rooms');
		}
	}, [leave, leaveRoom, roomId, router, stopPaymentTimer]);

	// XummのAPI呼び出し用mutation（ペイロード結果取得のみ必要）
	const getPayloadResultMutation = api.xumm.getPayloadResult.useMutation();

	// Removed ledger channel info fetching - API already provides updated channel amounts

	// Agoraのユーザー数が変化したらルーム情報を再取得
	useEffect(() => {
		if (isJoined) {
			refetchRoom();
		}
	}, [remoteUsers.length, isJoined, refetchRoom]);

	// Room monitoring hook
	useRoomMonitoring({
		isHost,
		room,
		isJoined,
		remoteUsers,
		paymentIntervalRef,
		userId,
		roomId,
		handleLeaveRoom,
		leaveRoom,
	});

	// 発言権の状態が変わったときの処理
	useEffect(() => {
		const checkSpeakPermissionChange = async () => {
			// 発言権が新たに付与された場合
			if (participant?.canSpeak && !canSpeak && isJoined) {
				try {
					const { token } = await getAgoraToken({ roomId });
					setAgoraToken(token);
					// 新しいトークンで再接続
					await leave();
					await join(token);
					alert('発言権が付与されました。音声を開始できます。');
				} catch (error) {
					console.error('Failed to reconnect with new permissions:', error);
				}
			}
		};

		checkSpeakPermissionChange();
	}, [participant?.canSpeak]);

	// デバッグ用：ルーム情報をログ出力
	useEffect(() => {
		if (room) {
			console.log('Room data:', room);
			console.log('Room participants:', room.participants);
			console.log('Participants count:', room.participants.length);
		}
	}, [room]);

	// デバッグ用：Agoraの接続状態をログ出力
	useEffect(() => {
		console.log('Agora connection state:', {
			isJoined,
			remoteUsersCount: remoteUsers.length,
			remoteUsers: remoteUsers.map(u => ({ uid: u.uid, type: typeof u.uid })),
			connectionState,
			hostInRoomState,
			isHost,
			userId,
		});
	}, [isJoined, remoteUsers, connectionState, hostInRoomState, isHost, userId]);

	// デバッグ用：チャネル情報をログ出力
	useEffect(() => {
		console.log('Channel query status:', {
			userId,
			room: !!room,
			roomId,
			isHost,
			isLoadingChannel,
			myChannel,
			enabled: !!userId && !!room && !isHost,
			roomCreatorId: room?.creatorId,
			userIdMatchesCreator: userId === room?.creatorId,
		});
	}, [userId, room, roomId, isHost, isLoadingChannel, myChannel]);

	const handleJoinRoomWithPayment = async () => {
		console.log('🚀 handleJoinRoom clicked', { isJoining, roomId, userId, isHost });

		if (!userId) {
			console.log('❌ No userId, redirecting to signin');
			router.push('/auth/signin');
			return;
		}

		if (isJoining) {
			console.warn('⚠️ Already joining, ignoring click');
			return;
		}

		try {
			console.log('🚀 Setting isJoining to true');
			setIsJoining(true);

			// Ensure room data is available
			if (!room) {
				console.error('❌ Room data not available');
				throw new Error('Room data not available');
			}

			// Check if user is host
			const currentIsHost = userId === room.creatorId;

			// NFTチケットモードの場合はペイメントチャネルをスキップ
			if (room.paymentMode === 'NFT_TICKET') {
				console.log('NFT ticket mode - skipping payment channel');
			} else {
				// ペイメントチャネルの確認（ホスト以外で有料ルームの場合）
				console.log('Checking payment channel requirements:', {
					userId,
					creatorId: room.creatorId,
					currentIsHost,
					xrpPerMinute: room.xrpPerMinute,
					hasMyChannel: !!myChannel,
					myChannelData: myChannel,
					isLoadingChannel,
				});

				// 有料ルームでホストではない場合、ペイメントチャネルが必要
				if (!currentIsHost && room.xrpPerMinute && room.xrpPerMinute > 0) {
				// チャネルがまだロード中の場合は待つ
				if (isLoadingChannel) {
					console.log('Payment channel still loading...');
					return;
				}

				if (!myChannel) {
					// ペイメントチャネルがない場合は作成を要求
					console.log('Payment channel required but not found');
					console.log('Current isCreatingChannel:', isCreatingChannel);
					setIsJoining(false);
					// チャネル作成画面を表示
					handlePaymentChannelCreation();
					console.log('Called handlePaymentChannelCreation');
					return; // ルームには参加しない
				}
					// 既存のチャネルがある場合はそれを使用
					console.log('Using existing payment channel:', myChannel.channelId);
					setPaymentChannelId(myChannel.channelId);
				}
			}

			// ペイメントチャネルの確認が完了したら、ルームに参加
			joinRoom({ roomId });

			// 少し待ってから参加者情報を再取得
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Re-fetch room data to ensure we have the latest participant info
			await refetchRoom();

			// 支払いタイマーを開始（NFTチケットモード以外の有料ルームの場合）
			if (!currentIsHost && room.paymentMode !== 'NFT_TICKET' && room.xrpPerMinute && room.xrpPerMinute > 0 && myChannel) {
				// Convert existing amount from drops to XRP if it exists
				const existingAmountXRP = myChannel.lastAmount
					? Number(dropsToXrp(myChannel.lastAmount))
					: 0;
				const totalSeconds = startPaymentTimer(myChannel.channelId, existingAmountXRP);
				if (totalSeconds !== undefined) {
					setTotalPaidSeconds(totalSeconds);
				}
			}

			// Payment Channelが不要または作成済みの場合のみAgoraに接続
			// Agoraトークンを取得
			const { token } = await getAgoraToken({ roomId });
			setAgoraToken(token);

			// Agoraに接続（トークンを直接渡す）
			const joined = await join(token);

			if (joined === false) {
				throw new Error('Failed to join Agora channel');
			}

			// ホストの場合は音声を公開（自動公開を削除し、手動で行うように変更）
			if (shouldBeHost) {
				console.log('Host mode enabled. Please start audio manually.');
			}
		} catch (error) {
			console.error('Failed to join room:', error);
			alert('ルームへの参加に失敗しました');
		} finally {
			setIsJoining(false);
		}
	};

	const handleAddDeposit = async () => {
		if (!myChannel || depositAmountXRP <= 0) return;

		try {
			setIsAddingDeposit(true);
			console.log('Adding deposit:', depositAmountXRP, 'XRP to channel:', myChannel.channelId);

			const result = await addDeposit({
				channelId: myChannel.channelId,
				additionalAmountXRP: depositAmountXRP,
			});

			if (!result.payload) {
				throw new Error('Payload data not available');
			}

			const payloadResponse = result.payload;
			console.log('Deposit payload created:', payloadResponse);

			if (!payloadResponse.uuid) {
				throw new Error('No UUID in payload response');
			}

			// QRコードをUIに表示
			if (payloadResponse.qrUrl) {
				setXummQrCode(payloadResponse.qrUrl);
			}

			// ディープリンクURL
			if (payloadResponse.deeplink) {
				setXummQrUrl(payloadResponse.deeplink);
				// モバイルの場合は自動的に開く
				if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
					window.open(payloadResponse.deeplink, '_blank');
				}
			}

			// 署名完了を待つ
			console.log('Waiting for deposit signature...');
			let signed = false;
			let attempts = 0;
			const maxAttempts = 120; // 2分間待機

			// 最初のポーリングまで少し待機
			await new Promise((resolve) => setTimeout(resolve, 5000));

			while (!signed && attempts < maxAttempts) {
				attempts++;

				try {
					const payloadResult = await getPayloadResultMutation.mutateAsync({
						uuid: payloadResponse.uuid,
					});

					if (payloadResult.meta?.signed === true && payloadResult.meta?.resolved === true) {
						signed = true;
						console.log('✅ Transaction signed by user');

						// Check if transaction ID exists
						if (!payloadResult.response?.txid) {
							console.error('❌ No transaction ID in response');
							throw new Error('Transaction was signed but no transaction ID was returned');
						}

						console.log('📝 Transaction ID:', payloadResult.response.txid);

						// Get channel amount before transaction
						const previousAmount = myChannel ? BigInt(myChannel.amount) : 0n;
						console.log('💰 Previous channel amount:', dropsToXrp(previousAmount.toString()), 'XRP');

						// Wait for XRPL to process the transaction with retry logic
						console.log('⏳ Waiting for XRPL to process transaction...');
						
						let verificationAttempts = 0;
						const maxVerificationAttempts = 3;
						let depositVerified = false;
						let channelResult = null;
						let roomResult = null;
						
						while (verificationAttempts < maxVerificationAttempts && !depositVerified) {
							verificationAttempts++;
							
							// Wait longer on first attempt, shorter on retries
							const waitTime = verificationAttempts === 1 ? 8000 : 3000;
							console.log(`⏳ Attempt ${verificationAttempts}/${maxVerificationAttempts}: Waiting ${waitTime}ms for XRPL...`);
							await new Promise((resolve) => setTimeout(resolve, waitTime));

							// Refetch channel information to verify deposit was added
							console.log(`🔄 Attempt ${verificationAttempts}: Verifying deposit was added...`);
							[channelResult, roomResult] = await Promise.all([
								refetchMyChannel(),
								refetchRoom(),
							]);

							// Verify the deposit was actually added
							if (!channelResult.data) {
								console.error(`❌ Attempt ${verificationAttempts}: Could not fetch updated channel data`);
								if (verificationAttempts === maxVerificationAttempts) {
									throw new Error('Failed to verify deposit was added after multiple attempts');
								}
								continue;
							}

							const newAmount = BigInt(channelResult.data.amount);
							const actualAddedAmount = newAmount - previousAmount;
							const expectedAddedAmount = BigInt(xrpToDrops(depositAmountXRP));

							console.log(`💰 Attempt ${verificationAttempts}: New channel amount:`, dropsToXrp(newAmount.toString()), 'XRP');
							console.log(`💸 Attempt ${verificationAttempts}: Actually added:`, dropsToXrp(actualAddedAmount.toString()), 'XRP');
							console.log(`💸 Attempt ${verificationAttempts}: Expected to add:`, dropsToXrp(expectedAddedAmount.toString()), 'XRP');

							// Check if amount increased
							if (actualAddedAmount > 0n) {
								depositVerified = true;
								console.log(`✅ Attempt ${verificationAttempts}: Deposit verified successfully!`);
							} else {
								console.warn(`⚠️ Attempt ${verificationAttempts}: Channel amount not yet updated on XRPL`);
								if (verificationAttempts === maxVerificationAttempts) {
									console.error('❌ Channel amount did not increase after all attempts');
									// Log additional debugging info
									console.error('Debug info:', {
										previousAmount: dropsToXrp(previousAmount.toString()),
										newAmount: dropsToXrp(newAmount.toString()),
										channelId: myChannel?.channelId,
										transactionId: payloadResult.response.txid,
									});
									const explorerUrl = `${env.NEXT_PUBLIC_XRPL_NETWORK.includes('testnet') ? 'https://testnet.xrpl.org' : 'https://livenet.xrpl.org'}/transactions/${payloadResult.response.txid}`;
									console.error('🔗 Transaction explorer URL:', explorerUrl);
									throw new Error(`Deposit transaction may have failed - channel amount did not increase. Please check the transaction on XRPL explorer: ${explorerUrl}`);
								}
							}
						}
						
						if (!depositVerified || !channelResult?.data) {
							throw new Error('Failed to verify deposit after all attempts');
						}
						
						// Continue with verified data
						const newAmount = BigInt(channelResult.data.amount);
						const actualAddedAmount = newAmount - previousAmount;
						const expectedAddedAmount = BigInt(xrpToDrops(depositAmountXRP));

						// Verify the correct amount was added (allowing for small rounding differences)
						const difference = actualAddedAmount > expectedAddedAmount 
							? actualAddedAmount - expectedAddedAmount 
							: expectedAddedAmount - actualAddedAmount;
						
						// Allow up to 10 drops difference for rounding
						if (difference > 10n) {
							console.warn('⚠️ Added amount differs from expected:', {
								actual: dropsToXrp(actualAddedAmount.toString()),
								expected: dropsToXrp(expectedAddedAmount.toString()),
								difference: dropsToXrp(difference.toString()),
							});
						}

						console.log('✅ Deposit verified successfully');

						console.log('📊 Updated data:', {
							channel: channelResult.data
								? {
										channelId: channelResult.data.channelId.slice(0, 8) + '...',
										amount: dropsToXrp(channelResult.data.amount),
										lastAmount: channelResult.data.lastAmount
											? dropsToXrp(channelResult.data.lastAmount)
											: '0',
									}
								: null,
							roomParticipants: roomResult?.data?.participants.length,
						});

						// QRコードを非表示
						setXummQrUrl(null);
						setXummQrCode(null);
						setIsAddingDeposit(false);
						setDepositAmountXRP(0);

						// 残高不足状態をリセット
						setIsBalanceInsufficient(false);
						console.log('✅ Balance insufficient state reset');
						
						// デポジット追加成功後、音声を再開
						if (isRemoteAudioPaused) {
							try {
								await resumeRemoteAudio();
								console.log('✅ Remote audio resumed after deposit');
							} catch (error) {
								console.error('❌ Failed to resume remote audio:', error);
							}
						}

						// 支払いタイマーが停止していた場合は再開
						if (!paymentIntervalRef.current && isJoined && channelResult.data) {
							console.log('🔄 Restarting payment timer after deposit...');
							const channelData = channelResult.data;
							
							// 現在の経過秒数を取得
							const currentSeconds = getCurrentPaidSeconds();
							console.log('Current paid seconds:', currentSeconds);
							
							// チャネルの最新のlastAmountを使用
							const lastAmountXRP = channelData.lastAmount
								? Number(dropsToXrp(channelData.lastAmount))
								: 0;
							
							// タイマーを再開（lastAmountから継続）
							const totalSeconds = startPaymentTimer(channelData.channelId, lastAmountXRP);
							if (totalSeconds !== undefined) {
								setTotalPaidSeconds(totalSeconds);
								console.log('✅ Payment timer restarted with lastAmount:', lastAmountXRP);
							}
						}

						// 成功メッセージ
						const addedAmountStr = dropsToXrp(actualAddedAmount.toString());
						if (isJoined) {
							// ルーム情報を再取得して最新の権限状態を確認
							const updatedParticipant = roomResult?.data?.participants.find((p) => p.userId === userId);
							
							if (updatedParticipant?.canSpeak && !isHost) {
								alert(`✅ デポジットが正常に追加されました！\n\n追加額: ${addedAmountStr} XRP\n\n音声の送受信が再開されます。\n音声配信を再開するには「音声を開始」ボタンをクリックしてください。`);
							} else if (!updatedParticipant?.canSpeak && participant?.canSpeak) {
								// 権限が剥奪されていた場合
								alert(`✅ デポジットが正常に追加されました！\n\n追加額: ${addedAmountStr} XRP\n\n音声受信が再開されます。\n※残高不足により発言権が取り消されました。再度リクエストしてください。`);
							} else {
								alert(`✅ デポジットが正常に追加されました！\n\n追加額: ${addedAmountStr} XRP\n\n音声受信が再開されます。`);
							}
						} else {
							alert(
								`✅ デポジットが正常に追加されました！\n\n追加額: ${addedAmountStr} XRP\n\n「参加する」ボタンでルームに参加できます。`,
							);
						}

						console.log('🎯 Deposit complete');
						return;
					} else if (
						payloadResult.meta?.resolved === true &&
						payloadResult.meta?.signed === false
					) {
						console.log('Deposit cancelled');
						alert('デポジットの追加がキャンセルされました');
						break;
					} else if (payloadResult.meta?.expired === true) {
						console.log('Deposit expired');
						alert('デポジットの追加がタイムアウトしました');
						break;
					}
				} catch (pollError) {
					console.warn('Error polling payload result:', pollError);
				}

				if (!signed && attempts < maxAttempts) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}

			if (!signed) {
				throw new Error('Deposit addition timeout');
			}
		} catch (error) {
			console.error('Failed to add deposit:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			
			// Provide more specific error messages
			if (errorMessage.includes('XRPL explorer')) {
				// This is our custom error with explorer link
				alert(errorMessage);
			} else if (errorMessage.includes('timeout')) {
				alert('デポジットの追加がタイムアウトしました。Xummアプリで署名を完了してください。');
			} else if (errorMessage.includes('cancelled')) {
				alert('デポジットの追加がキャンセルされました。');
			} else {
				alert(`デポジットの追加に失敗しました: ${errorMessage}`);
			}
		} finally {
			setXummQrUrl(null);
			setXummQrCode(null);
			setIsAddingDeposit(false);

			// 最終的にデータを再取得（失敗時も含めて）
			console.log('🔄 Final data refresh after deposit attempt');
			try {
				await Promise.all([refetchMyChannel(), refetchRoom()]);
			} catch (refreshError) {
				console.warn('⚠️ Failed to refresh data after deposit:', refreshError);
			}
		}
	};

	const handleCancelPaymentChannel = () => {
		setXummQrUrl(null);
		setXummQrCode(null);
		setIsCreatingChannel(false);
		setIsJoining(false);
		setChannelAmountXRP(0); // リセット
		// ルーム一覧に戻る（まだ参加していないのでleaveRoomは不要）
		router.push('/rooms');
	};

	const handleJoinRoom = async () => {
		if (!room || !userId) return;

		// For NFT ticket mode, just join directly
		if (room.paymentMode === 'NFT_TICKET') {
			try {
				setIsJoining(true);

				// Join room on server
				joinRoom({ roomId });

				// Wait a bit for the join to process
				await new Promise((resolve) => setTimeout(resolve, 500));

				// Refetch room data
				await refetchRoom();

				// Get Agora token
				const { token } = await getAgoraToken({ roomId });
				setAgoraToken(token);

				// Join Agora channel
				const joinResult = await join(token);
				if (joinResult === false) {
					throw new Error('Failed to join Agora channel');
				}

				setIsJoining(false);
				console.log('Successfully joined NFT ticket room');
			} catch (error) {
				console.error('Failed to join NFT room:', error);
				alert('ルームへの参加に失敗しました');
				setIsJoining(false);
			}
			return;
		}

		// For payment channel mode, handle channel creation
		await handlePaymentChannelCreation();
	};

	const handlePaymentChannelCreation = async () => {
		if (!room || !userId) return;

		try {
			setIsCreatingChannel(true);

			// 既存チャネルの確認
			const { data: existingChannel } = await refetchMyChannel();
			if (existingChannel) {
				console.log('Found existing channel during creation:', existingChannel.channelId);
				setPaymentChannelId(existingChannel.channelId);

				// 既存チャネルを使用してルームに参加
				setIsCreatingChannel(false);

				// サーバー側でルームに参加
				joinRoom({ roomId });

				// 少し待ってから参加者情報を再取得
				await new Promise((resolve) => setTimeout(resolve, 500));

				// 参加者情報を再取得して確実に参加が完了したことを確認
				await refetchRoom();

				// 支払いタイマーを開始
				const existingAmountXRP = existingChannel.lastAmount
					? Number(dropsToXrp(existingChannel.lastAmount))
					: 0;
				const totalSeconds = startPaymentTimer(existingChannel.channelId, existingAmountXRP);
				if (totalSeconds !== undefined) {
					setTotalPaidSeconds(totalSeconds);
				}

				// Agoraトークンを取得
				const { token } = await getAgoraToken({ roomId });
				setAgoraToken(token);

				// Agoraに接続
				const joinResult = await join(token);
				if (joinResult === false) {
					throw new Error('Failed to join Agora channel');
				}

				return;
			}

			// デフォルトは60分間の料金を計算（最小1 XRP）
			const defaultMinutes = 60;
			const defaultAmountXRP = Math.max(1, room.xrpPerMinute * defaultMinutes);

			// 初回の場合は金額を設定
			if (channelAmountXRP === 0) {
				console.log('Setting initial channel amount:', defaultAmountXRP);
				setChannelAmountXRP(defaultAmountXRP);
				console.log('isCreatingChannel should be true now');
				return; // UIを表示するためにここで一旦終了
			}

			// Payment Channel作成トランザクションを準備
			console.log('Creating payment channel with amount:', channelAmountXRP, 'XRP');
			console.log('Room ID:', room.id);
			console.log('User ID:', userId);

			const result = await createPaymentChannel({
				roomId: room.id,
				amountXRP: channelAmountXRP,
			});
			console.log('Create payment channel result:', result);

			if (result.existingChannel && result.channel) {
				console.log('Using existing channel:', result.channel.channelId);
				setPaymentChannelId(result.channel.channelId);

				// 既存チャネルを使用してルームに参加
				setIsCreatingChannel(false);

				// サーバー側でルームに参加
				joinRoom({ roomId });

				// 少し待ってから参加者情報を再取得
				await new Promise((resolve) => setTimeout(resolve, 500));

				// 参加者情報を再取得して確実に参加が完了したことを確認
				await refetchRoom();

				// 支払いタイマーを開始
				const existingAmountXRP = result.channel.lastAmount
					? Number(dropsToXrp(result.channel.lastAmount))
					: 0;
				const totalSeconds = startPaymentTimer(result.channel.channelId, existingAmountXRP);
				if (totalSeconds !== undefined) {
					setTotalPaidSeconds(totalSeconds);
				}

				// Agoraトークンを取得
				const { token } = await getAgoraToken({ roomId });
				setAgoraToken(token);

				// Agoraに接続
				const joinResult = await join(token);
				if (joinResult === false) {
					throw new Error('Failed to join Agora channel');
				}

				return;
			}

			// すでにサーバー側でペイロードが作成されている
			if (!result.payload) {
				console.error('No payload in result:', result);
				throw new Error('Payload data not available');
			}

			if (result.transaction) {
				console.log('Transaction details:', JSON.stringify(result.transaction, null, 2));
			}

			const payloadResponse = result.payload;
			console.log('Using server-created payload:', payloadResponse);

			if (!payloadResponse.uuid) {
				throw new Error('No UUID in payload response');
			}

			// QRコードをUIに表示
			if (payloadResponse.qrUrl) {
				setXummQrCode(payloadResponse.qrUrl);
				console.log('QR Code URL:', payloadResponse.qrUrl);
			}

			// ディープリンクURL
			if (payloadResponse.deeplink) {
				setXummQrUrl(payloadResponse.deeplink);
				console.log('Deep link URL:', payloadResponse.deeplink);
				// モバイルの場合は自動的に開く
				if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
					window.open(payloadResponse.deeplink, '_blank');
				}
			}

			// 署名完了を待つ
			console.log('Waiting for signature...');
			let signed = false;
			let attempts = 0;
			const maxAttempts = 120; // 2分間待機

			// 最初のポーリングまで少し待機（Xummアプリが起動するまで）
			await new Promise((resolve) => setTimeout(resolve, 5000));

			while (!signed && attempts < maxAttempts) {
				attempts++;

				try {
					console.log(
						`Polling attempt ${attempts}/${maxAttempts} for UUID: ${payloadResponse.uuid}`,
					);
					const payloadResult = await getPayloadResultMutation.mutateAsync({
						uuid: payloadResponse.uuid,
					});

					console.log('Payload result:', {
						signed: payloadResult.meta?.signed,
						resolved: payloadResult.meta?.resolved,
						uuid: payloadResult.meta?.uuid,
						status: payloadResult.meta?.payload_uuidv4,
						opened: payloadResult.meta?.opened,
						expired: payloadResult.meta?.expired,
						cancelled: payloadResult.meta?.cancelled,
						finished: payloadResult.meta?.finished,
						return_url_app: payloadResult.meta?.return_url_app,
					});
					console.log('Full meta:', JSON.stringify(payloadResult.meta, null, 2));
					console.log('Full response:', JSON.stringify(payloadResult.response, null, 2));

					// 明確に署名された場合
					if (payloadResult.meta?.signed === true && payloadResult.meta?.resolved === true) {
						signed = true;
						console.log('✅ Transaction signed by user');

						// Check if transaction ID exists
						if (!payloadResult.response?.txid) {
							console.error('❌ No transaction ID in response');
							throw new Error('Transaction was signed but no transaction ID was returned');
						}

						const txHash = payloadResult.response.txid;
						console.log('📝 Transaction ID:', txHash);

						// Wait for XRPL to process the transaction (4-6 seconds for ledger close)
						console.log('⏳ Waiting for XRPL to process transaction...');
						await new Promise((resolve) => setTimeout(resolve, 6000));

						// チャネル情報を再取得
						console.log('🔄 Verifying payment channel was created...');
						const { data: newChannel } = await refetchMyChannel();

						if (!newChannel) {
							console.error('❌ Payment channel was not created');
							throw new Error('Payment channel creation failed - channel not found after transaction');
						}

						console.log('✅ Payment channel created successfully:', newChannel.channelId);
						
						// Verify the channel amount matches what was requested
						const actualAmount = BigInt(newChannel.amount);
						const expectedAmount = BigInt(xrpToDrops(channelAmountXRP));
						
						if (actualAmount !== expectedAmount) {
							console.warn('⚠️ Channel amount differs from expected:', {
								actual: dropsToXrp(actualAmount.toString()),
								expected: dropsToXrp(expectedAmount.toString()),
							});
						}
						
						setPaymentChannelId(newChannel.channelId);

						// チャネル作成成功後、QRコードを非表示
						setXummQrUrl(null);
						setXummQrCode(null);
						setIsCreatingChannel(false);

						// 自動的にルームに参加
						console.log('Channel created successfully, now joining room...');
						setIsJoining(true);

						// サーバー側でルームに参加
						joinRoom({ roomId });

						// 少し待ってから参加者情報を再取得
						await new Promise((resolve) => setTimeout(resolve, 500));

						// 参加者情報を再取得して確実に参加が完了したことを確認
						await refetchRoom();

						// 支払いタイマーを開始
						const totalSeconds = startPaymentTimer(newChannel.channelId, 0);
						if (totalSeconds !== undefined) {
							setTotalPaidSeconds(totalSeconds);
						}

						// Agoraトークンを取得して接続
						try {
							const { token } = await getAgoraToken({ roomId });
							setAgoraToken(token);

							const joinResult = await join(token);
							if (joinResult === false) {
								throw new Error('Failed to join Agora channel');
							}

							setIsJoining(false);
							console.log('Successfully joined room after channel creation');
						} catch (joinError) {
							console.error('Failed to join after channel creation:', joinError);
							setIsJoining(false);
							alert('チャネル作成後のルーム参加に失敗しました');
						}
						break;
					}
					// 明確にキャンセルされた場合（resolvedがtrueでsignedがfalse、かつopenedがtrue）
					else if (
						payloadResult.meta?.resolved === true &&
						payloadResult.meta?.signed === false &&
						payloadResult.meta?.opened === true
					) {
						console.log('Payment channel creation explicitly cancelled');
						alert('支払いチャネルの作成がキャンセルされました');
						// クリーンアップ
						setXummQrUrl(null);
						setXummQrCode(null);
						setIsCreatingChannel(false);
						setIsJoining(false);
						setChannelAmountXRP(0); // リセット
						return;
					}
					// タイムアウトまたは期限切れの場合
					else if (payloadResult.meta?.expired === true) {
						console.log('Payment channel creation expired');
						alert('支払いチャネルの作成がタイムアウトしました。もう一度お試しください。');
						// クリーンアップ
						setXummQrUrl(null);
						setXummQrCode(null);
						setIsCreatingChannel(false);
						setIsJoining(false);
						setChannelAmountXRP(0); // リセット
						return;
					}
					// その他の場合は処理中として続行
					else {
						console.log('Payload still pending...', {
							resolved: payloadResult.meta?.resolved,
							signed: payloadResult.meta?.signed,
							opened: payloadResult.meta?.opened,
							expired: payloadResult.meta?.expired,
						});
					}
				} catch (pollError) {
					console.warn('Error polling payload result:', pollError);
				}

				// 次のポーリングまで待機
				if (!signed && attempts < maxAttempts) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}

			if (!signed) {
				throw new Error('Payment channel creation timeout');
			}

			// この時点でチャネル作成は成功しているが、
			// 実際の参加処理は上記のnewChannel確認後に実行される
		} catch (error) {
			console.error('Payment channel creation error:', error);
			const errorMessage = error instanceof Error ? error.message : '不明なエラー';
			alert(`支払いチャネルの作成に失敗しました: ${errorMessage}`);
			// エラー時のクリーンアップ
			setXummQrUrl(null);
			setXummQrCode(null);
			setIsCreatingChannel(false);
			setChannelAmountXRP(0); // リセット
			// ルームから退出せず、ボタンを再表示
			setIsJoining(false);
		}
	};

	const handleStartRoom = () => {
		console.log('🚀 handleStartRoom clicked', { roomId, room: room?.status });
		try {
			startRoom(
				{ roomId },
				{
					onSuccess: () => {
						console.log('✅ Room started successfully');
						// 状態を更新
						refetchRoom();
					},
					onError: (error) => {
						console.error('❌ Failed to start room:', error);
						alert(`ルーム開始に失敗しました: ${error.message}`);
					},
				},
			);
		} catch (error) {
			console.error('❌ Error in handleStartRoom:', error);
		}
	};

	const handleEndRoom = () => {
		console.log('🚀 handleEndRoom clicked', { roomId, room: room?.status });
		if (confirm('本当にルームを終了しますか？')) {
			try {
				endRoom(
					{ roomId },
					{
						onSuccess: () => {
							console.log('✅ Room ended successfully');
							router.push('/rooms');
						},
						onError: (error) => {
							console.error('❌ Failed to end room:', error);
							alert(`ルーム終了に失敗しました: ${error.message}`);
						},
					},
				);
			} catch (error) {
				console.error('❌ Error in handleEndRoom:', error);
			}
		}
	};

	// クリーンアップ
	useEffect(() => {
		return () => {
			stopPaymentTimer();
			// leave関数は非同期なので、アンマウント時には呼ばない
			// useAgoraフック内でクリーンアップが行れる
		};
	}, [stopPaymentTimer]);

	if (isCheckingAuth || isLoading) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<p>Loading...</p>
			</main>
		);
	}

	if (!room) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<p>ルームが見つかりません</p>
			</main>
		);
	}

	// Check NFT ticket access for non-hosts
	if (room.paymentMode === 'NFT_TICKET' && !isHost && hasNFTAccess === false) {
		return (
			<NFTTicketPurchase
				roomId={roomId}
				roomTitle={room.title}
				ticketPrice={room.nftTicketPrice || 1}
				ticketImageUrl={room.nftTicketImageUrl || undefined}
				onPurchaseComplete={async () => {
					console.log('NFT Purchase completed, refetching access...');
					// Reset checking state and refetch
					setIsCheckingNFTAccess(true);
					setHasNFTAccess(null);
					// Refetch access and room data
					await Promise.all([
						refetchNFTAccess(),
						refetchRoom()
					]);
					console.log('Refetch completed');
				}}
			/>
		);
	}

	// Still checking NFT access - only show if hasNFTAccess is not determined yet
	if (room.paymentMode === 'NFT_TICKET' && !isHost && hasNFTAccess === null) {
		console.log('Showing access checking screen:', {
			paymentMode: room.paymentMode,
			isHost,
			isCheckingNFTAccess,
			hasNFTAccess,
			nftAccessData,
			queryEnabled: !!room && room.paymentMode === 'NFT_TICKET' && !!userId
		});
		return (
			<main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
				<div className="text-center">
					<p>アクセス権を確認中...</p>
					<p className="mt-2 text-sm text-gray-400">
						{isCheckingNFTAccess ? 'チェック中' : 'データ待機中'}
					</p>
				</div>
			</main>
		);
	}

	console.log('Render state:', {
		isCreatingChannel,
		isAddingDeposit,
		isJoined,
		channelAmountXRP,
		xummQrCode,
		xummQrUrl
	});

	return (
		<main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
			{/* Speak permission revocation notification */}
			<SpeakPermissionNotification wasRevoked={wasRevoked} onClose={clearRevoked} />
			
			<div className="container mx-auto px-4 py-8">
				<RoomInfo room={room as any} participantCount={room.participants.length} />
				<div className="mx-auto max-w-4xl">
					{/* デポジット追加中は他のUIを非表示 */}
					{isAddingDeposit ? (
						<div className="rounded-lg bg-white/10 p-6">
							<DepositAddition
								isAddingDeposit={isAddingDeposit}
								depositAmountXRP={depositAmountXRP}
								xummQrCode={xummQrCode}
								xummQrUrl={xummQrUrl}
								myChannel={myChannel}
								room={room}
								onDepositAmountChange={setDepositAmountXRP}
								onAddDeposit={handleAddDeposit}
								onCancel={() => {
									setXummQrUrl(null);
									setXummQrCode(null);
									setIsAddingDeposit(false);
									setDepositAmountXRP(0);
								}}
							/>
						</div>
					) : (
						<>
							<div className="rounded-lg bg-white/10 p-6">
								<PaymentChannelCreation
									isCreatingChannel={isCreatingChannel}
									channelAmountXRP={channelAmountXRP}
									xummQrCode={xummQrCode}
									xummQrUrl={xummQrUrl}
									room={room}
									onAmountChange={setChannelAmountXRP}
									onCreateChannel={handlePaymentChannelCreation}
									onCancel={handleCancelPaymentChannel}
								/>

								{!isJoined ? (
									<div className="mt-10 text-center">
										{room.status === 'ENDED' ? (
											<p className="mb-4 text-gray-400">このルームは終了しました</p>
										) : (
											<>
												<p className="mb-4 text-gray-300">
													{room.status === 'WAITING'
														? 'ルームはまだ開始されていません'
														: 'ルームに参加しますか？'}
												</p>
												{!isHost && room.paymentMode !== 'NFT_TICKET' && room.xrpPerMinute && room.xrpPerMinute > 0 && (
													<div className="mb-4 rounded-lg bg-yellow-900/50 p-4">
														<p className="mb-2 text-sm text-yellow-300">
															このルームは有料です（{room.xrpPerMinute} XRP/分）
														</p>
														{isLoadingChannel ? (
															<p className="text-gray-400 text-sm">ペイメントチャネルを確認中...</p>
														) : !myChannel ? (
															<p className="text-sm text-yellow-300">
																参加するにはペイメントチャネルの作成が必要です
															</p>
														) : (
															<div className="space-y-2">
																<p className="font-semibold text-green-300 text-sm">
																	✓ 既存のペイメントチャネルが見つかりました
																</p>
																<div className="space-y-1 rounded bg-black/30 p-3">
																	<div className="flex justify-between text-xs">
																		<span className="text-gray-400">デポジット額:</span>
																		<span className="text-white">
																			{dropsToXrp(myChannel.amount)} XRP
																		</span>
																	</div>
																	<div className="flex justify-between text-xs">
																		<span className="text-gray-400">使用済み額:</span>
																		<span className="text-white">
																			{myChannel.lastAmount
																				? dropsToXrp(myChannel.lastAmount)
																				: '0'}{' '}
																			XRP
																		</span>
																	</div>
																	<div className="flex justify-between text-xs">
																		<span className="text-gray-400">残高:</span>
																		<span className="font-semibold text-green-300">
																			{(() => {
																				// Calculate balance: deposit - used
																				const depositAmount = BigInt(myChannel.amount);
																				console.log('depositAmount', depositAmount);
																				const usedAmount = BigInt(myChannel.lastAmount || '0');
																				const availableBalance = depositAmount - usedAmount;
																				
																				return dropsToXrp(availableBalance.toString());
																			})()}{' '}
																			XRP
																		</span>
																	</div>
																	<div className="flex justify-between text-xs">
																		<span className="text-gray-400">視聴可能時間:</span>
																		<span
																			className={
																				(() => {
																					const depositAmount = BigInt(myChannel.amount);
																					const usedAmount = BigInt(myChannel.lastAmount || '0');
																					const availableBalance = depositAmount - usedAmount;
																					const minutes = Math.floor(Number(dropsToXrp(availableBalance.toString())) / room.xrpPerMinute);
																					return minutes < 5;
																				})()
																					? 'text-red-400'
																					: 'text-yellow-300'
																			}
																		>
																			約
																			{(() => {
																				const depositAmount = BigInt(myChannel.amount);
																				const usedAmount = BigInt(myChannel.lastAmount || '0');
																				const availableBalance = depositAmount - usedAmount;
																				return Math.floor(Number(dropsToXrp(availableBalance.toString())) / room.xrpPerMinute);
																			})()}
																			分
																		</span>
																	</div>
																	<div className="border-gray-700 border-t pt-2">
																		<a
																			href={`${env.NEXT_PUBLIC_XRPL_NETWORK.includes('testnet') ? 'https://test.xrplexplorer.com/ja/object/transactions/' : 'https://xrplexplorer.com/ja/object/'}/transactions/${myChannel.channelId}`}
																			target="_blank"
																			rel="noopener noreferrer"
																			className="flex items-center gap-1 text-blue-400 text-xs underline hover:text-blue-300"
																		>
																			エクスプローラーで確認
																			<svg
																				className="h-3 w-3"
																				fill="none"
																				stroke="currentColor"
																				viewBox="0 0 24 24"
																			>
																				<path
																					strokeLinecap="round"
																					strokeLinejoin="round"
																					strokeWidth={2}
																					d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
																				/>
																			</svg>
																		</a>
																	</div>
																</div>
																{Math.floor(
																	Number(
																		dropsToXrp(
																			BigInt(myChannel.amount) -
																				BigInt(myChannel.lastAmount || '0'),
																		),
																	) / room.xrpPerMinute,
																) < 5 && (
																	<div className="mt-2 space-y-2">
																		<p className="text-red-400 text-xs">
																			⚠️
																			残高が少なくなっています。追加のデポジットが必要かもしれません。
																		</p>
																		<div className="rounded-lg bg-blue-900/30 p-2">
																			<p className="mb-2 text-blue-300 text-xs">デバッグ情報:</p>
																			<pre className="text-blue-100 text-xs">
																				{JSON.stringify(
																					{
																						isAddingDeposit,
																						depositAmountXRP,
																						roomXrpPerMinute: room.xrpPerMinute,
																					},
																					null,
																					2,
																				)}
																			</pre>
																		</div>
																		<button
																			type="button"
																			onMouseEnter={() => console.log('🖱️ Button mouse enter')}
																			onMouseDown={() => console.log('🖱️ Button mouse down')}
																			onMouseUp={() => console.log('🖱️ Button mouse up')}
																			onClick={(e) => {
																				console.log('🚀 Deposit button clicked!', {
																					event: e,
																					currentTarget: e.currentTarget,
																					target: e.target,
																					isAddingDeposit,
																					room: room?.xrpPerMinute,
																					timestamp: new Date().toISOString(),
																				});
																				e.preventDefault();
																				e.stopPropagation();

																				try {
																					const defaultDeposit = Math.max(
																						10,
																						room.xrpPerMinute * 30,
																					);
																					console.log(
																						'Setting deposit amount to:',
																						defaultDeposit,
																						'XRP (rate:',
																						room.xrpPerMinute,
																						'XRP/min)',
																					);
																					setDepositAmountXRP(defaultDeposit);
																					setIsAddingDeposit(true);
																					console.log('✅ isAddingDeposit set to true');
																				} catch (error) {
																					console.error('❌ Error in button click handler:', error);
																				}
																			}}
																			className="w-full rounded-lg border-2 border-yellow-400 bg-yellow-600 px-4 py-2 font-semibold text-white shadow-md transition-all duration-200 hover:bg-yellow-700"
																			style={{
																				position: 'relative',
																				zIndex: 9999,
																				pointerEvents: 'auto',
																			}}
																		>
																			デポジットを追加 (テスト版)
																		</button>
																		<p className="mt-1 text-gray-400 text-xs">
																			ボタンが反応しない場合は、ブラウザのコンソールを確認してください
																		</p>
																	</div>
																)}
															</div>
														)}
													</div>
												)}

												{/* 参加ボタン - デポジット確認後に表示 */}
												<div className="mt-6">
													{/* ステータス情報の表示 */}
													<div className="mb-4 rounded-lg bg-blue-900/20 p-3">
														<p className="mb-2 text-blue-300 text-sm">参加ステータス:</p>
														<div className="space-y-1 text-blue-100 text-xs">
															<div className="flex justify-between">
																<span>ユーザーID:</span>
																<span>{userId ? userId.slice(0, 8) + '...' : '未設定'}</span>
															</div>
															<div className="flex justify-between">
																<span>ホスト:</span>
																<span>{isHost ? 'はい' : 'いいえ'}</span>
															</div>
															<div className="flex justify-between">
																<span>チャネル:</span>
																<span>{myChannel ? 'あり' : 'なし'}</span>
															</div>
															<div className="flex justify-between">
																<span>参加状態:</span>
																<span>{isJoined ? '参加済み' : '未参加'}</span>
															</div>
															{!isHost && myChannel && (
																<div className="flex justify-between">
																	<span>視聴可能時間:</span>
																	<span
																		className={
																			Math.floor(
																				Number(
																					dropsToXrp(
																						BigInt(myChannel.amount) -
																							BigInt(myChannel.lastAmount || '0'),
																					),
																				) / (room.xrpPerMinute || 0.01),
																			) < 5
																				? 'font-semibold text-red-400'
																				: 'text-green-300'
																		}
																	>
																		約
																		{Math.floor(
																			Number(
																				dropsToXrp(
																					BigInt(myChannel.amount) -
																						BigInt(myChannel.lastAmount || '0'),
																				),
																			) / (room.xrpPerMinute || 0.01),
																		)}
																		分
																	</span>
																</div>
															)}
														</div>
													</div>

													{/* 参加ボタン */}
													<button
														type="button"
														onClick={(e) => {
															console.log('🚀 Join room button clicked', {
																isJoining,
																isLoadingChannel,
																isHost,
																myChannel: !!myChannel,
																userId,
																roomStatus: room.status,
															});
															handleJoinRoomWithPayment();
														}}
														disabled={
															!!(
																isJoining ||
																(room.paymentMode !== 'NFT_TICKET' && isLoadingChannel) ||
																hostInRoomState === false ||
																(room.status === 'WAITING' && !isHost) ||
																(!isHost &&
																	room.paymentMode !== 'NFT_TICKET' &&
																	room.xrpPerMinute > 0 &&
																	myChannel &&
																	Math.floor(
																		Number(
																			dropsToXrp(
																				BigInt(myChannel.amount) -
																					BigInt(myChannel.lastAmount || '0'),
																			),
																		) / (room.xrpPerMinute || 0.01),
																	) <= 0)
															)
														}
														className="w-full rounded-full bg-blue-600 px-8 py-3 font-semibold text-lg transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
													>
														{isJoining
															? '参加中...'
															: isLoadingChannel
																? 'チャネル確認中...'
																: hostInRoomState === false && !isHost
																	? 'ホスト待機中...'
																	: room.status === 'WAITING'
																		? 'ルームに参加 (開始待ち)'
																		: 'ルームに参加'}
													</button>

													{/* 参加できない理由の表示 */}
													{hostInRoomState === false && !isHost && (
														<p className="mt-2 text-center text-sm text-gray-400">
															🔄 ホストがルームに入るまでお待ちください
														</p>
													)}
													{!isHost && room.paymentMode !== 'NFT_TICKET' && room.xrpPerMinute > 0 && (
														<>
															{!myChannel && (
																<p className="mt-2 text-center text-sm text-yellow-300">
																	💳 参加にはペイメントチャネルの作成が必要です
																</p>
															)}
															{myChannel &&
																Math.floor(
																	Number(
																		dropsToXrp(
																			BigInt(myChannel.amount) -
																				BigInt(myChannel.lastAmount || '0'),
																		),
																	) / (room.xrpPerMinute || 0.01),
																) <= 0 && (
																	<p className="mt-2 text-center text-red-300 text-sm">
																		⚠️ 残高不足です。デポジットを追加してください
																	</p>
																)}
														</>
													)}
												</div>
											</>
										)}
									</div>
								) : (
									<div>
										<div className="mb-6 flex items-center justify-between">
											<AudioControls
												canSpeak={!!canSpeak}
												isPublished={isPublished}
												isMuted={isMuted}
												connectionState={connectionState}
												shouldBeHost={shouldBeHost}
												participant={participant}
												roomId={roomId}
												onPublishAudio={publishAudio}
												onToggleMute={toggleMute}
												onRequestSpeak={() => requestSpeak({ roomId })}
												onLeaveRoom={handleLeaveRoom}
												myChannel={myChannel || undefined}
												room={room || undefined}
												isBalanceInsufficient={isBalanceInsufficient}
											/>
											{isHost && (
												<HostControls
													roomStatus={room.status}
													roomId={roomId}
													onStartRoom={handleStartRoom}
													onEndRoom={handleEndRoom}
												/>
											)}
										</div>

										<ParticipantsList
											participants={room.participants as ParticipantWithAllFields[]}
											isHost={isHost}
											roomId={roomId}
											onGrantSpeak={(participantId) => grantSpeak({ roomId, participantId })}
											onRevokeSpeak={(participantId) => revokeSpeak({ roomId, participantId })}
										/>

										{/* 音声状態の表示 */}
										<div className="mt-6 text-gray-400 text-sm">
											<p>接続ユーザー数: {remoteUsers.length + 1}</p>
											<p>接続状態: {connectionState}</p>
											{isHost && <p className="text-green-400">あなたはホストです</p>}
											{participant?.canSpeak && !shouldBeHost && (
												<p className="text-blue-400">発言権があります</p>
											)}
											{canSpeak && !isPublished && (
												<p className="text-yellow-400">音声を開始してください</p>
											)}

											{/* Audio Level Indicators */}
											{/* 残高不足時は音声レベル表示を隠す */}
											{!isBalanceInsufficient && (
												<AudioLevelDisplay
													isPublished={isPublished}
													localAudioLevel={localAudioLevel}
													isMuted={isMuted}
													remoteAudioLevels={remoteAudioLevels}
													participants={room.participants as ParticipantWithAllFields[]}
												/>
											)}

											{/* NFTチケットモード以外の場合のみペイメントステータスを表示 */}
											{room.paymentMode !== 'NFT_TICKET' && (
												<PaymentStatusDisplay
													myChannel={myChannel}
													paymentChannelId={paymentChannelId}
													totalPaidSeconds={totalPaidSeconds}
													room={room}
													incomingChannels={incomingChannels}
													isHost={isHost}
													depositAmountXRP={depositAmountXRP}
													isAddingDeposit={isAddingDeposit}
													isRemoteAudioPaused={isRemoteAudioPaused}
													onAddDeposit={() => {
														const defaultDeposit = Math.max(
															10,
															room.xrpPerMinute ? room.xrpPerMinute * 30 : 10,
														);
														setDepositAmountXRP(defaultDeposit);
														setIsAddingDeposit(true);
													}}
												/>
											)}
										</div>
									</div>
								)}
							</div>
						</>
					)}
				</div>
			</div>
		</main>
	);
}
