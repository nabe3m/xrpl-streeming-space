'use client';

import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '~/env';
import { generateNumericUid } from '~/lib/uid';

interface UseAgoraParams {
	channelName: string;
	uid?: string;
	token?: string;
	isHost?: boolean;
}

interface UseAgoraReturn {
	client: IAgoraRTCClient | null;
	localAudioTrack: IMicrophoneAudioTrack | null;
	remoteUsers: IAgoraRTCRemoteUser[];
	isJoined: boolean;
	isPublished: boolean;
	join: (token?: string) => Promise<boolean>;
	leave: () => Promise<void>;
	toggleMute: () => Promise<void>;
	isMuted: boolean;
	publishAudio: () => Promise<void>;
	unpublishAudio: () => Promise<void>;
	connectionState: string;
	localAudioLevel: number;
	remoteAudioLevels: Map<string | number, number>;
	pauseRemoteAudio: () => Promise<void>;
	resumeRemoteAudio: () => Promise<void>;
	isRemoteAudioPaused: boolean;
}

export function useAgora({
	channelName,
	uid,
	token: defaultToken,
	isHost = false,
}: UseAgoraParams): UseAgoraReturn {
	const [client, setClient] = useState<IAgoraRTCClient | null>(null);
	const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
	const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
	const [isJoined, setIsJoined] = useState(false);
	const [isPublished, setIsPublished] = useState(false);
	const [isMuted, setIsMuted] = useState(false);
	const [agoraEngine, setAgoraEngine] = useState<any>(null);
	const [connectionState, setConnectionState] = useState<string>('DISCONNECTED');
	const [localAudioLevel, setLocalAudioLevel] = useState<number>(0);
	const [remoteAudioLevels, setRemoteAudioLevels] = useState<Map<string | number, number>>(
		new Map(),
	);
	const [isRemoteAudioPaused, setIsRemoteAudioPaused] = useState(false);
	const remoteAudioTracksRef = useRef<Map<string | number, any>>(new Map());
	const unsubscribedUsersRef = useRef<Set<string | number>>(new Set());

	// user-published イベントハンドラーを別途定義
	const handleUserPublished = useCallback(async (user: any, mediaType: string) => {
		console.log('User published:', { uid: user.uid, mediaType });
		if (mediaType === 'audio' && client) {
			// 音声停止中のユーザーはサブスクライブしない
			if (unsubscribedUsersRef.current.has(user.uid)) {
				console.log('User is in unsubscribed list, skipping subscription:', user.uid);
				return;
			}
			
			// 音声が一時停止中の場合はサブスクライブしない
			if (isRemoteAudioPaused) {
				console.log('Remote audio is paused, skipping subscription:', user.uid);
				unsubscribedUsersRef.current.add(user.uid);
				return;
			}
			
			try {
				await client.subscribe(user, mediaType);
				console.log('Successfully subscribed to user:', user.uid);
				const track = user.audioTrack;
				if (track) {
					// トラックを保存
					remoteAudioTracksRef.current.set(user.uid, track);
					track.play();
					console.log('Playing audio track for user:', user.uid);
				} else {
					console.warn('No audio track found for user:', user.uid);
				}
			} catch (error) {
				console.error('Failed to subscribe to user:', user.uid, error);
			}
		}
		setRemoteUsers((prev) => [...prev.filter((u) => u.uid !== user.uid), user]);
	}, [client, isRemoteAudioPaused]);

	useEffect(() => {
		// 動的にAgoraをインポート（クライアントサイドのみ）
		if (typeof window !== 'undefined') {
			import('agora-rtc-sdk-ng').then((AgoraRTC) => {
				setAgoraEngine(AgoraRTC.default);

				const agoraClient = AgoraRTC.default.createClient({
					mode: 'rtc',
					codec: 'h264', // 変更: より安定したH264コーデックを使用
				});

				// user-published イベントは後で設定

				agoraClient.on('user-unpublished', (user, mediaType) => {
					if (mediaType === 'audio') {
						// トラックを削除
						remoteAudioTracksRef.current.delete(user.uid);
						setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
						// 音声レベルも削除
						setRemoteAudioLevels((prev) => {
							const newMap = new Map(prev);
							newMap.delete(user.uid);
							return newMap;
						});
					}
				});

				agoraClient.on('user-left', (user) => {
					// トラックを削除
					remoteAudioTracksRef.current.delete(user.uid);
					setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
					// 音声レベルも削除
					setRemoteAudioLevels((prev) => {
						const newMap = new Map(prev);
						newMap.delete(user.uid);
						return newMap;
					});
				});

				// 接続状態の変化を監視
				agoraClient.on('connection-state-change', (curState, prevState, reason) => {
					console.log('Agora connection state changed:', { curState, prevState, reason });
					setConnectionState(curState);

					if (curState === 'DISCONNECTED') {
						console.warn('Agora connection lost:', reason);
						// 切断時は状態をリセット
						setIsJoined(false);
						setIsPublished(false);
						setRemoteUsers([]);
					} else if (curState === 'RECONNECTING') {
						console.warn('Agora reconnecting:', reason);
					}
				});

				// エラーハンドリング
				agoraClient.on('exception', (event) => {
					console.warn('Agora exception (non-critical):', event);
				});

				// ネットワーク品質の監視
				agoraClient.on('network-quality', (stats) => {
					if (stats.downlinkNetworkQuality <= 2) {
						console.warn('Poor network quality detected:', stats);
					}
				});

				// 音声レベルの監視を有効化
				agoraClient.enableAudioVolumeIndicator();

				// 音声レベルインジケーター
				agoraClient.on('volume-indicator', (volumes) => {
					volumes.forEach((volume) => {
						if (volume.uid === agoraClient.uid) {
							// 自分の音声レベル
							setLocalAudioLevel(volume.level);
						} else {
							// リモートユーザーの音声レベル
							setRemoteAudioLevels((prev) => {
								const newMap = new Map(prev);
								newMap.set(volume.uid, volume.level);
								return newMap;
							});
						}
					});
				});

				setClient(agoraClient);
			});
		}

		return () => {
			if (client) {
				client.removeAllListeners();
			}
		};
	}, []);

	// clientが設定された後にイベントハンドラーを登録
	useEffect(() => {
		if (client) {
			client.on('user-published', handleUserPublished);
			
			return () => {
				client.off('user-published', handleUserPublished);
			};
		}
	}, [client, handleUserPublished]);

	const join = useCallback(
		async (tokenOverride?: string): Promise<boolean> => {
			if (!client || !env.NEXT_PUBLIC_AGORA_APP_ID || !agoraEngine) return false;

			// 既に接続されている場合は何もしない
			if (isJoined || client.connectionState === 'CONNECTED') {
				console.log('Already joined or connected, skipping join', {
					isJoined,
					connectionState: client.connectionState,
				});
				return true;
			}
			
			// 接続中の場合はクリーンアップ
			if (client.connectionState === 'CONNECTING') {
				console.log('Cleaning up existing connection before join...');
				try {
					await client.leave();
					// 少し待つ
					await new Promise(resolve => setTimeout(resolve, 1000));
				} catch (cleanupError) {
					console.error('Error during pre-join cleanup:', cleanupError);
				}
			}

			// 接続状態が中間状態の場合は待機
			if (client.connectionState === 'CONNECTING' || client.connectionState === 'RECONNECTING') {
				console.log('Connection in progress, waiting...', client.connectionState);
				let waitCount = 0;
				while (waitCount < 20) {
					await new Promise(resolve => setTimeout(resolve, 500));
					waitCount++;
					// 毎回状態を再取得 (状態は動的に変わるのでas anyを使用)
					const state: any = client.connectionState;
					if (state === 'CONNECTED') {
						setIsJoined(true);
						return true;
					} else if (state !== 'CONNECTING' && state !== 'RECONNECTING') {
						// 接続中以外の状態になったら抜ける
						break;
					}
				}
			}

			// 切断中の場合は完全に切断されるまで待つ
			if (client.connectionState === 'DISCONNECTING') {
				console.log('Still disconnecting, waiting...');
				let waitCount = 0;
				while (client.connectionState === 'DISCONNECTING' && waitCount < 10) {
					await new Promise(resolve => setTimeout(resolve, 500));
					waitCount++;
				}
			}

			try {
				const appId = env.NEXT_PUBLIC_AGORA_APP_ID;
				const token = tokenOverride || defaultToken;

				// Convert string UID to numeric UID (same logic as token generation)
				let numericUserId: string | number = Math.floor(Math.random() * 1000000);
				if (uid) {
					numericUserId = generateNumericUid(uid);
				}

				console.log('Joining Agora channel:', {
					appId,
					channelName,
					hasToken: !!token,
					userId: numericUserId,
					originalUid: uid,
					tokenPreview: token ? `${token.substring(0, 20)}...` : 'null',
					currentConnectionState: client.connectionState,
				});

				// トークンを使用してチャンネルに参加
				console.log('Connection state before join:', client.connectionState);
				await client.join(appId, channelName, token || null, numericUserId);
				console.log('Connection state after join:', client.connectionState);

				// 接続が確立されるまで待つ
				let retries = 0;
				while (retries < 20) {
					const currentState: string = client.connectionState;
					if (currentState === 'CONNECTED') {
						setIsJoined(true);
						console.log('Successfully connected to Agora channel');
						return true;
					}
					console.log(`Waiting for connection... state: ${currentState}, retry: ${retries}`);
					await new Promise((resolve) => setTimeout(resolve, 500));
					retries++;
				}

				// タイムアウト
				console.error('Failed to establish connection after retries');
				await client.leave();
				return false;
			} catch (error: any) {
				console.error('Failed to join channel:', error);
				
				// UID_CONFLICT エラーの場合は、少し待ってから再試行
				if (error?.code === 'UID_CONFLICT') {
					console.log('UID conflict detected, waiting before retry...');
					setIsJoined(false);
					setConnectionState('DISCONNECTED');
					
					// 既存の接続をクリーンアップ
					try {
						await client.leave();
					} catch (leaveError) {
						console.error('Error leaving on UID conflict:', leaveError);
					}
					
					// 少し待ってから再接続を促す
					await new Promise(resolve => setTimeout(resolve, 2000));
					
					throw new Error('UID conflict detected. This usually happens when trying to join from multiple tabs. Please close other tabs and try again.');
				}
				
				throw error;
			}
		},
		[client, channelName, uid, defaultToken, isHost, agoraEngine, isJoined],
	);

	const leave = useCallback(async () => {
		if (!client) return;

		try {
			// 先に音声トラックをクリーンアップ
			if (localAudioTrack) {
				try {
					localAudioTrack.close();
				} catch (closeError) {
					console.error('Error closing audio track:', closeError);
				}
				setLocalAudioTrack(null);
			}

			// unpublishは接続状態を確認してから実行
			if (isPublished) {
				// 接続中かつチャンネルに参加している場合のみunpublish
				if (client.connectionState === 'CONNECTED' && isJoined) {
					try {
						await client.unpublish();
					} catch (unpublishError) {
						console.error('Error unpublishing:', unpublishError);
						// unpublishのエラーは無視して続行
					}
				}
			}
			setIsPublished(false);

			// チャンネルから退出
			if (isJoined) {
				// 既に切断されていない場合のみleave
				if (
					client.connectionState !== 'DISCONNECTED' &&
					client.connectionState !== 'DISCONNECTING'
				) {
					try {
						await client.leave();
					} catch (leaveError) {
						console.error('Error leaving channel:', leaveError);
						// leaveのエラーも無視して続行
					}
				}
			}

			// 状態をリセット
			setIsJoined(false);
			setRemoteUsers([]);
			setConnectionState('DISCONNECTED');
		} catch (error) {
			console.error('Unexpected error in leave:', error);
			// エラーが発生しても状態はリセット
			setIsJoined(false);
			setRemoteUsers([]);
			setIsPublished(false);
			setConnectionState('DISCONNECTED');
		}
	}, [client, localAudioTrack, isPublished, isJoined]);

	const publishAudio = useCallback(async () => {
		// Check client and agoraEngine directly, not React state
		if (!client || !agoraEngine) {
			console.error('Cannot publish audio: client or engine not ready', {
				client: !!client,
				agoraEngine: !!agoraEngine,
			});
			throw new Error('Client or engine not ready');
		}

		// Check if we're actually connected
		const currentState = client.connectionState;
		if (currentState !== 'CONNECTED') {
			console.error('Cannot publish audio: not connected', {
				connectionState: currentState,
			});

			// Try to wait for connection
			let retries = 0;
			let state = client.connectionState;
			while (state !== 'CONNECTED' && retries < 10) {
				console.log(`Waiting for connection before publish... state: ${state}`);
				await new Promise((resolve) => setTimeout(resolve, 500));
				state = client.connectionState;
				retries++;
			}

			if (state !== 'CONNECTED') {
				throw new Error(`Not connected after retries. State: ${state}`);
			}
		}

		if (isPublished || localAudioTrack) {
			console.log('Audio already published or track exists');
			return;
		}

		let audioTrack = null;
		try {
			console.log('Creating microphone audio track...');
			audioTrack = await agoraEngine.createMicrophoneAudioTrack({
				encoderConfig: 'music_standard', // 音質設定
			});

			// 最終確認: 接続状態を再度チェック
			if (client.connectionState !== 'CONNECTED') {
				audioTrack.close();
				throw new Error(`Connection lost before publish. State: ${client.connectionState}`);
			}

			console.log('Publishing audio track...');
			await client.publish(audioTrack);

			// 成功後に状態を更新
			setLocalAudioTrack(audioTrack);
			setIsPublished(true);
			// 初期状態はミュートされていない（音声有効）
			setIsMuted(false);
			console.log('Audio track published successfully');
		} catch (error) {
			console.error('Failed to publish audio:', error);
			// エラー時のクリーンアップ
			if (audioTrack) {
				try {
					audioTrack.close();
				} catch (closeError) {
					console.error('Error closing audio track:', closeError);
				}
			}
			setIsPublished(false);
			throw error;
		}
	}, [client, agoraEngine, isPublished, localAudioTrack]);

	const toggleMute = useCallback(async () => {
		if (!localAudioTrack) return;

		// isMuted = true の時は音声を有効化（アンミュート）
		// isMuted = false の時は音声を無効化（ミュート）
		const newMutedState = !isMuted;
		await localAudioTrack.setEnabled(!newMutedState);
		setIsMuted(newMutedState);
	}, [localAudioTrack, isMuted]);

	const unpublishAudio = useCallback(async () => {
		if (!client) {
			console.log('No client available');
			return;
		}

		try {
			console.log('Unpublishing audio...', {
				isPublished,
				hasLocalTrack: !!localAudioTrack,
				connectionState: client.connectionState
			});

			// まずクライアントからアンパブリッシュ（先に実行）
			if (client.connectionState === 'CONNECTED' && isPublished) {
				try {
					await client.unpublish();
					console.log('Successfully unpublished from client');
				} catch (unpublishError) {
					console.error('Error unpublishing:', unpublishError);
				}
			}

			// 音声トラックを停止・削除
			if (localAudioTrack) {
				try {
					localAudioTrack.stop();
					localAudioTrack.close();
					console.log('Audio track stopped and closed');
				} catch (closeError) {
					console.error('Error closing audio track:', closeError);
				}
				setLocalAudioTrack(null);
			}

			// 音声レベル監視を無効化（イベントリスナーを削除）
			try {
				client.removeAllListeners('volume-indicator');
				console.log('Audio volume indicator listener removed');
			} catch (volumeError) {
				console.error('Error removing volume indicator listener:', volumeError);
			}

			// 状態をリセット
			setIsPublished(false);
			setIsMuted(false);
			setLocalAudioLevel(0); // 音声レベルもリセット

			console.log('Audio unpublished successfully');
		} catch (error) {
			console.error('Failed to unpublish audio:', error);
			// エラーが発生しても状態はリセット
			setIsPublished(false);
			setIsMuted(false);
			setLocalAudioLevel(0);
		}
	}, [client, isPublished, localAudioTrack]);

	// リモート音声を完全に停止（アンサブスクライブ）
	const pauseRemoteAudio = useCallback(async () => {
		if (!client) {
			console.log('Client not ready');
			return;
		}

		console.log('Stopping all remote audio tracks...', {
			remoteUsersCount: remoteUsers.length,
			tracksCount: remoteAudioTracksRef.current.size,
		});
		
		// まず既存のトラックをすべて停止
		remoteAudioTracksRef.current.forEach((track, uid) => {
			try {
				track.stop();
				console.log(`Stopped audio track for user: ${uid}`);
			} catch (error) {
				console.error(`Failed to stop track for user ${uid}:`, error);
			}
		});
		
		// すべてのリモートユーザーからアンサブスクライブ
		for (const user of remoteUsers) {
			try {
				// ユーザーからアンサブスクライブ
				await client.unsubscribe(user, 'audio');
				console.log(`Unsubscribed from user: ${user.uid}`);
				
				// アンサブスクライブしたユーザーを記録
				unsubscribedUsersRef.current.add(user.uid);
			} catch (error) {
				console.error(`Failed to unsubscribe from user ${user.uid}:`, error);
			}
		}
		
		// トラックマップをクリア
		remoteAudioTracksRef.current.clear();
		
		setIsRemoteAudioPaused(true);
		console.log('All remote audio tracks stopped and unsubscribed');
	}, [client, remoteUsers]);

	// リモート音声を再開（再サブスクライブ）
	const resumeRemoteAudio = useCallback(async () => {
		if (!client || !isRemoteAudioPaused) {
			console.log('Client not ready or remote audio not paused');
			return;
		}

		console.log('Re-subscribing to all remote audio tracks...');
		
		// アンサブスクライブリストをクリア
		unsubscribedUsersRef.current.clear();
		
		// すべてのリモートユーザーに再サブスクライブ
		for (const user of remoteUsers) {
			if (user.hasAudio) {
				try {
					await client.subscribe(user, 'audio');
					console.log(`Re-subscribed to user: ${user.uid}`);
					
					const track = user.audioTrack;
					if (track) {
						remoteAudioTracksRef.current.set(user.uid, track);
						track.play();
						console.log(`Resumed audio track for user: ${user.uid}`);
					}
				} catch (error) {
					console.error(`Failed to re-subscribe to user ${user.uid}:`, error);
				}
			}
		}
		
		setIsRemoteAudioPaused(false);
		console.log('All remote audio tracks resumed');
	}, [client, isRemoteAudioPaused, remoteUsers]);

	useEffect(() => {
		return () => {
			// コンポーネントのアンマウント時のクリーンアップ
			if (localAudioTrack) {
				try {
					localAudioTrack.close();
				} catch (error) {
					console.error('Error closing audio track on unmount:', error);
				}
			}
			// leave関数は非同期なので、ここでは呼ばない
			// 代わりに状態のリセットのみ行う
			setIsJoined(false);
			setIsPublished(false);
			setRemoteUsers([]);
			setConnectionState('DISCONNECTED');
		};
	}, []); // 依存配列を空にして、アンマウント時のみ実行

	return {
		client,
		localAudioTrack,
		remoteUsers,
		isJoined,
		isPublished,
		join,
		leave,
		toggleMute,
		isMuted,
		publishAudio,
		unpublishAudio,
		connectionState,
		localAudioLevel,
		remoteAudioLevels,
		pauseRemoteAudio,
		resumeRemoteAudio,
		isRemoteAudioPaused,
	};
}
