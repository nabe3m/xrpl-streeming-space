'use client';

import type { IAgoraRTCClient, IAgoraRTCRemoteUser, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { useCallback, useEffect, useState } from 'react';
import { env } from '~/env';

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
	connectionState: string;
	localAudioLevel: number;
	remoteAudioLevels: Map<string | number, number>;
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
	const [remoteAudioLevels, setRemoteAudioLevels] = useState<Map<string | number, number>>(new Map());

	useEffect(() => {
		// 動的にAgoraをインポート（クライアントサイドのみ）
		if (typeof window !== 'undefined') {
			import('agora-rtc-sdk-ng').then((AgoraRTC) => {
				setAgoraEngine(AgoraRTC.default);

				const agoraClient = AgoraRTC.default.createClient({
					mode: 'rtc',
					codec: 'h264', // 変更: より安定したH264コーデックを使用
				});

				agoraClient.on('user-published', async (user, mediaType) => {
					console.log('User published:', { uid: user.uid, mediaType });
					if (mediaType === 'audio') {
						try {
							await agoraClient.subscribe(user, mediaType);
							console.log('Successfully subscribed to user:', user.uid);
							const track = user.audioTrack;
							if (track) {
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
				});

				agoraClient.on('user-unpublished', (user, mediaType) => {
					if (mediaType === 'audio') {
						setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
					}
				});

				agoraClient.on('user-left', (user) => {
					setRemoteUsers((prev) => prev.filter((u) => u.uid !== user.uid));
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
							setRemoteAudioLevels(prev => {
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

	const join = useCallback(
		async (tokenOverride?: string): Promise<boolean> => {
			if (!client || !env.NEXT_PUBLIC_AGORA_APP_ID || !agoraEngine) return false;

			try {
				const appId = env.NEXT_PUBLIC_AGORA_APP_ID;
				const token = tokenOverride || defaultToken;

				// Convert string UID to numeric UID (same logic as token generation)
				let numericUserId: string | number = Math.floor(Math.random() * 1000000);
				if (uid) {
					let hash = 0;
					for (let i = 0; i < uid.length; i++) {
						hash = (hash << 5) - hash + uid.charCodeAt(i);
						hash = hash & hash; // Convert to 32bit integer
					}
					numericUserId = Math.abs(hash) % 1000000;
				}

				console.log('Joining Agora channel:', {
					appId,
					channelName,
					hasToken: !!token,
					userId: numericUserId,
					originalUid: uid,
					tokenPreview: token ? `${token.substring(0, 20)}...` : 'null',
				});

				// トークンを使用してチャンネルに参加
				console.log('Connection state before join:', client.connectionState);
				await client.join(appId, channelName, token || null, numericUserId);
				console.log('Connection state after join:', client.connectionState);

				// 接続が確立されるまで待つ
				let retries = 0;
				while (client.connectionState !== 'CONNECTED' && retries < 20) {
					console.log(
						`Waiting for connection... state: ${client.connectionState}, retry: ${retries}`,
					);
					await new Promise((resolve) => setTimeout(resolve, 500));
					retries++;
				}

				if (client.connectionState === 'CONNECTED') {
					setIsJoined(true);
					console.log('Successfully connected to Agora channel');
					return true;
				} else {
					console.error('Failed to establish connection after retries');
					await client.leave();
					return false;
				}
			} catch (error) {
				console.error('Failed to join channel:', error);
				throw error;
			}
		},
		[client, channelName, uid, defaultToken, isHost, agoraEngine],
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
				if (client.connectionState !== 'DISCONNECTED' && client.connectionState !== 'DISCONNECTING') {
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
		connectionState,
		localAudioLevel,
		remoteAudioLevels,
	};
}
