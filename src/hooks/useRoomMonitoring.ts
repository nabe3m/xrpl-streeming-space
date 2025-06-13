import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { generateNumericUid } from '~/lib/uid';

interface UseRoomMonitoringProps {
	isHost: boolean;
	room:
		| {
				status: string;
				creatorId: string;
				participants: Array<{ role: string }>;
		  }
		| null
		| undefined;
	isJoined: boolean;
	remoteUsers: Array<{ uid: string | number }>;
	paymentIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
	userId: string | null;
	roomId: string;
	handleLeaveRoom: () => Promise<void>;
	leaveRoom: (params: { roomId: string }) => void;
}

export function useRoomMonitoring({
	isHost,
	room,
	isJoined,
	remoteUsers,
	paymentIntervalRef,
	userId,
	roomId,
	handleLeaveRoom,
	leaveRoom,
}: UseRoomMonitoringProps) {
	const router = useRouter();

	// ホストの接続状態を監視（リスナーのみ）
	useEffect(() => {
		let disconnectTimeoutId: NodeJS.Timeout | null = null;
		let checkIntervalId: NodeJS.Timeout | null = null;
		let hasLeft = false;
		let hostWasConnected = false;

		const checkHostConnection = () => {
			if (!isHost && room && isJoined && room.status === 'LIVE' && !hasLeft) {
				// ホストのUIDを生成（サーバー側と同じロジック）
				const hostUid = generateNumericUid(room.creatorId);

				const hostConnected = remoteUsers.some((user) => Number(user.uid) === hostUid);

				console.log('Checking host connection:', {
					hostUid,
					hostConnected,
					remoteUserUids: remoteUsers.map((u) => Number(u.uid)),
					hostWasConnected,
				});

				if (hostConnected) {
					// ホストが接続している
					hostWasConnected = true;
					if (disconnectTimeoutId) {
						clearTimeout(disconnectTimeoutId);
						disconnectTimeoutId = null;
					}
				} else if (hostWasConnected && !hostConnected) {
					// ホストが一度接続してから切断された場合
					console.log('Host disconnected from Agora, starting disconnect timer...');

					if (!disconnectTimeoutId) {
						// 15秒待ってもホストが再接続しない場合は退室
						disconnectTimeoutId = setTimeout(async () => {
							const stillNoHost = !remoteUsers.some((user) => Number(user.uid) === hostUid);
							if (stillNoHost && isJoined && !hasLeft && room.status === 'LIVE') {
								console.log('Host did not reconnect, leaving room');
								hasLeft = true;
								alert('ホストとの接続が切れました。配信を終了します。');

								if (paymentIntervalRef.current) {
									clearInterval(paymentIntervalRef.current);
									paymentIntervalRef.current = null;
								}

								await handleLeaveRoom();
							}
						}, 15000);
					}
				}
				// 初回でホストが見つからない場合は、まだ接続中の可能性があるので待つ
			}
		};

		// 定期的にチェック（2秒ごと）
		if (!isHost && room && isJoined && room.status === 'LIVE') {
			// 初回チェックは10秒後（ホストが接続するまでの猶予）
			const initialDelay = setTimeout(() => {
				checkHostConnection();
				// その後は2秒ごとにチェック
				checkIntervalId = setInterval(checkHostConnection, 2000);
			}, 10000);

			return () => {
				clearTimeout(initialDelay);
				if (checkIntervalId) {
					clearInterval(checkIntervalId);
				}
				if (disconnectTimeoutId) {
					clearTimeout(disconnectTimeoutId);
				}
			};
		}
	}, [remoteUsers, isHost, room, isJoined, handleLeaveRoom, paymentIntervalRef]);

	// 配信終了またはホスト不在を監視
	useEffect(() => {
		let hasLeft = false;

		const checkRoomStatus = async () => {
			if (!isHost && room && isJoined && !hasLeft) {
				// ルームが終了した場合
				if (room.status === 'ENDED') {
					console.log('Room has ended, leaving automatically');
					hasLeft = true;
					alert('配信が終了しました。');

					if (paymentIntervalRef.current) {
						clearInterval(paymentIntervalRef.current);
						paymentIntervalRef.current = null;
					}

					await handleLeaveRoom();
					return;
				}

				// ホストが存在しない場合
				const hostParticipant = room.participants.find((p) => p.role === 'HOST');
				if (!hostParticipant) {
					console.log('Host has left, leaving automatically');
					hasLeft = true;
					alert('ホストが退室しました。配信を終了します。');

					if (paymentIntervalRef.current) {
						clearInterval(paymentIntervalRef.current);
						paymentIntervalRef.current = null;
					}

					await handleLeaveRoom();
					return;
				}
			}
		};

		checkRoomStatus();
	}, [room?.status, room?.participants, isHost, isJoined, handleLeaveRoom, paymentIntervalRef]);

	// ブラウザを閉じる時の処理
	useEffect(() => {
		const handleBeforeUnload = () => {
			if (isJoined && userId) {
				navigator.sendBeacon(`/api/room/leave`, JSON.stringify({ roomId, userId }));
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	}, [isJoined, roomId, userId]);

	// ページ遷移時の処理
	useEffect(() => {
		const handleRouteChange = () => {
			if (isJoined) {
				console.log('Route change detected, leaving room');
				if (paymentIntervalRef.current) {
					clearInterval(paymentIntervalRef.current);
					paymentIntervalRef.current = null;
				}
				leaveRoom({ roomId });
				if (userId) {
					navigator.sendBeacon(`/api/room/leave`, JSON.stringify({ roomId, userId }));
				}
			}
		};

		window.addEventListener('popstate', handleRouteChange);

		return () => {
			window.removeEventListener('popstate', handleRouteChange);
			if (isJoined) {
				console.log('Component unmounting, leaving room');
				if (paymentIntervalRef.current) {
					clearInterval(paymentIntervalRef.current);
					paymentIntervalRef.current = null;
				}
				leaveRoom({ roomId });
				if (userId) {
					navigator.sendBeacon(`/api/room/leave`, JSON.stringify({ roomId, userId }));
				}
			}
		};
	}, [isJoined, roomId, leaveRoom, userId, paymentIntervalRef]);
}
