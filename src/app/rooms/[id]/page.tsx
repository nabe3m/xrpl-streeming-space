"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { dropsToXrp } from "xrpl";
import { env } from "~/env";
import { useAgora } from "~/hooks/useAgora";
import { api } from "~/trpc/react";
import { AudioLevelIndicator } from "~/components/AudioLevelIndicator";
import type { ParticipantWithAllFields } from "~/lib/types";
import { RoomInfo } from "~/components/room/RoomInfo";
import { HostControls } from "~/components/room/HostControls";
import { ParticipantsList } from "~/components/room/ParticipantsList";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [isJoining, setIsJoining] = useState(false);
  const [paymentChannelId, setPaymentChannelId] = useState<string | null>(null);
  const paymentIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [totalPaidSeconds, setTotalPaidSeconds] = useState(0);
  const [xummQrUrl, setXummQrUrl] = useState<string | null>(null);
  const [xummQrCode, setXummQrCode] = useState<string | null>(null);
  const [channelAmountXRP, setChannelAmountXRP] = useState<number>(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAddingDeposit, setIsAddingDeposit] = useState(false);
  const [depositAmountXRP, setDepositAmountXRP] = useState<number>(0);

  // ログインチェック
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUserId = localStorage.getItem("userId");
      setUserId(storedUserId);
      if (!storedUserId) {
        router.push("/auth/signin");
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

  // 自分の支払いチャネルを取得（ホスト以外の場合のみ有効）
  const {
    data: myChannel,
    refetch: refetchMyChannel,
    isLoading: isLoadingChannel,
  } = api.paymentChannel.getMyChannelForRoom.useQuery(
    { roomId },
    {
      enabled: !!userId && !!room && userId !== room.creatorId,
      refetchInterval: 5000, // 5秒ごとに更新（デポジット後の反映を早めるため）
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: true,
    },
  );

  console.log("🚀 myChannel query:", {
    data: myChannel,
    isLoading: isLoadingChannel,
    enabled: !!userId && !!room && userId !== room.creatorId,
    userId,
    roomCreatorId: room?.creatorId,
    isHost: userId === room?.creatorId,
  });

  // ホストの場合はリスナーからの支払いチャネルを取得
  const { data: incomingChannels } =
    api.paymentChannel.getChannelsForRoom.useQuery(
      { roomId },
      {
        enabled: !!userId && !!room && userId === room.creatorId,
        refetchInterval: 1000, // 1秒ごとに更新
      },
    );

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
  const { mutate: signPayment } = api.paymentChannel.signPayment.useMutation({
    onError: (error) => {
      console.error("Failed to sign payment:", error);
      console.error("Error message:", error.message);
      console.error("Error data:", error.data);
      console.error("Error shape:", error.shape);
      // 支払いタイマーを停止
      if (paymentIntervalRef.current) {
        clearInterval(paymentIntervalRef.current);
        paymentIntervalRef.current = null;
        console.error("Payment timer stopped due to error");
      }
    },
  });
  const { mutateAsync: getAgoraToken } = api.room.getAgoraToken.useMutation();
  const { mutateAsync: createPaymentChannel } =
    api.paymentChannel.createForRoom.useMutation();
  const { mutateAsync: addDeposit } =
    api.paymentChannel.addDeposit.useMutation();
  const { mutate: requestSpeak } = api.room.requestSpeak.useMutation({
    onSuccess: () => {
      refetchRoom();
      alert("発言権をリクエストしました");
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

  // Determine if user should be able to speak (host or listener with permission)
  const shouldBeHost = participant?.role === "HOST" || isHost;
  const canSpeak = shouldBeHost || participant?.canSpeak;

  const {
    join,
    leave,
    toggleMute,
    isMuted,
    isJoined,
    remoteUsers,
    publishAudio,
    isPublished,
    connectionState,
    localAudioLevel,
    remoteAudioLevels,
  } = useAgora({
    channelName: room?.agoraChannelName || "",
    isHost: canSpeak,
    token: agoraToken || undefined,
    uid: userId || undefined,
  });

  const handleLeaveRoom = useCallback(async () => {
    console.log("🚀 handleLeaveRoom clicked", { roomId, isJoined, paymentIntervalRef: !!paymentIntervalRef.current });
    
    try {
      console.log("🚀 Stopping payment timer...");
      if (paymentIntervalRef.current) {
        clearInterval(paymentIntervalRef.current);
        paymentIntervalRef.current = null;
        console.log("✅ Payment timer stopped");
      }

      console.log("🚀 Leaving Agora channel...");
      // leave関数を呼び出し（エラーは内部で処理される）
      await leave();
      console.log("✅ Left Agora channel");

      console.log("🚀 Leaving room on server...");
      // サーバー側の処理
      leaveRoom({ roomId });
      console.log("✅ Left room on server");

      console.log("🚀 Navigating to rooms list...");
      // ルーム一覧に戻る
      router.push("/rooms");
    } catch (error) {
      console.error("❌ Failed to leave room:", error);
      alert(`退室に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
      // エラーが発生してもルーム一覧に戻る
      router.push("/rooms");
    }
  }, [leave, leaveRoom, roomId, router]);

  // XummのAPI呼び出し用mutation（ペイロード結果取得のみ必要）
  const getPayloadResultMutation = api.xumm.getPayloadResult.useMutation();

  // Agoraのユーザー数が変化したらルーム情報を再取得
  useEffect(() => {
    if (isJoined) {
      refetchRoom();
    }
  }, [remoteUsers.length, isJoined, refetchRoom]);

  // ホストの接続状態を監視（リスナーのみ）
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let hasLeft = false; // 退室処理が既に実行されたかを追跡
    let initialCheckDone = false; // 初回チェックが完了したか

    const checkHostConnection = () => {
      if (!isHost && room && isJoined && room.status === "LIVE" && !hasLeft) {
        // ホストがAgoraに接続しているか確認
        // ホストのUIDはroom.creatorIdから生成される
        let hostUid = 0;
        for (let i = 0; i < room.creatorId.length; i++) {
          const hash = (hostUid << 5) - hostUid + room.creatorId.charCodeAt(i);
          hostUid = hash & hash; // Convert to 32bit integer
        }
        hostUid = Math.abs(hostUid) % 1000000;

        const hostConnected = remoteUsers.some((user) => user.uid === hostUid);

        // 初回チェックでない場合のみ、ホストが見つからない時の処理を実行
        if (!hostConnected && initialCheckDone) {
          console.log("Host not found in Agora, waiting...", {
            hostUid,
            remoteUsers: remoteUsers.map((u) => u.uid),
          });

          // 既存のタイムアウトをクリア
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          // 10秒待ってもホストが接続しない場合は退室
          timeoutId = setTimeout(async () => {
            const stillNoHost = !remoteUsers.some(
              (user) => user.uid === hostUid,
            );
            if (stillNoHost && isJoined && !hasLeft && room.status === "LIVE") {
              console.log("Host disconnected from Agora, leaving room");
              hasLeft = true; // 重複実行を防ぐ
              alert("ホストとの接続が切れました。配信を終了します。");

              // 支払いタイマーを停止
              if (paymentIntervalRef.current) {
                clearInterval(paymentIntervalRef.current);
                paymentIntervalRef.current = null;
              }

              // 退室処理
              await handleLeaveRoom();
            }
          }, 10000);
        } else if (hostConnected) {
          // ホストが接続している場合
          initialCheckDone = true; // ホストが一度でも確認できたら初回チェック完了
          // タイムアウトをクリア
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
        }
      }
    };

    // 初回は少し遅延させて実行（ホストがまだ接続していない可能性があるため）
    const initialDelay = setTimeout(() => {
      checkHostConnection();
    }, 3000);

    // クリーンアップ関数
    return () => {
      clearTimeout(initialDelay);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [remoteUsers, isHost, room, isJoined, handleLeaveRoom]);

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
          alert("発言権が付与されました。音声を開始できます。");
        } catch (error) {
          console.error("Failed to reconnect with new permissions:", error);
        }
      }
    };

    checkSpeakPermissionChange();
  }, [participant?.canSpeak]);

  // 配信終了またはホスト不在を監視
  useEffect(() => {
    let hasLeft = false; // 退室処理が既に実行されたかを追跡

    const checkRoomStatus = async () => {
      // リスナーの場合のみチェック
      if (!isHost && room && isJoined && !hasLeft) {
        // ルームが終了した場合
        if (room.status === "ENDED") {
          console.log("Room has ended, leaving automatically");
          hasLeft = true; // 重複実行を防ぐ
          alert("配信が終了しました。");

          // 支払いタイマーを停止
          if (paymentIntervalRef.current) {
            clearInterval(paymentIntervalRef.current);
            paymentIntervalRef.current = null;
          }

          // 退室処理
          await handleLeaveRoom();
          return;
        }

        // ホストが存在しない場合（ホストが退室した）
        const hostParticipant = room.participants.find(
          (p) => p.role === "HOST",
        );
        if (!hostParticipant) {
          console.log("Host has left, leaving automatically");
          hasLeft = true; // 重複実行を防ぐ
          alert("ホストが退室しました。配信を終了します。");

          // 支払いタイマーを停止
          if (paymentIntervalRef.current) {
            clearInterval(paymentIntervalRef.current);
            paymentIntervalRef.current = null;
          }

          // 退室処理
          await handleLeaveRoom();
          return;
        }
      }
    };

    checkRoomStatus();
  }, [room?.status, room?.participants, isHost, isJoined, handleLeaveRoom]);

  // デバッグ用：ルーム情報をログ出力
  useEffect(() => {
    if (room) {
      console.log("Room data:", room);
      console.log("Room participants:", room.participants);
      console.log("Participants count:", room.participants.length);
    }
  }, [room]);

  // デバッグ用：チャネル情報をログ出力
  useEffect(() => {
    console.log("Channel query status:", {
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

  const handleJoinRoom = async () => {
    console.log("🚀 handleJoinRoom clicked", { isJoining, roomId, userId, isHost });
    
    if (!userId) {
      console.log("❌ No userId, redirecting to signin");
      router.push("/auth/signin");
      return;
    }

    if (isJoining) {
      console.warn("⚠️ Already joining, ignoring click");
      return;
    }

    try {
      console.log("🚀 Setting isJoining to true");
      setIsJoining(true);

      // Ensure room data is available
      if (!room) {
        console.error("❌ Room data not available");
        throw new Error("Room data not available");
      }

      // Check if user is host
      const currentIsHost = userId === room.creatorId;

      // ペイメントチャネルの確認（ホスト以外で有料ルームの場合）
      console.log("Checking payment channel requirements:", {
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
          console.log("Payment channel still loading...");
          return;
        }

        if (!myChannel) {
          // ペイメントチャネルがない場合は作成を要求
          console.log("Payment channel required but not found");
          setIsJoining(false);
          // チャネル作成画面を表示
          handlePaymentChannelCreation();
          return; // ルームには参加しない
        }
        // 既存のチャネルがある場合はそれを使用
        console.log("Using existing payment channel:", myChannel.channelId);
        setPaymentChannelId(myChannel.channelId);
      }

      // ペイメントチャネルの確認が完了したら、ルームに参加
      joinRoom({ roomId });

      // 少し待ってから参加者情報を再取得
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Re-fetch room data to ensure we have the latest participant info
      await refetchRoom();

      // 支払いタイマーを開始（有料ルームの場合）
      if (
        !currentIsHost &&
        room.xrpPerMinute &&
        room.xrpPerMinute > 0 &&
        myChannel
      ) {
        // Convert existing amount from drops to XRP if it exists
        const existingAmountXRP = myChannel.lastAmount
          ? Number(dropsToXrp(myChannel.lastAmount))
          : 0;
        startPaymentTimer(myChannel.channelId, existingAmountXRP);
      }

      // Payment Channelが不要または作成済みの場合のみAgoraに接続
      // Agoraトークンを取得
      const { token } = await getAgoraToken({ roomId });
      setAgoraToken(token);

      // Agoraに接続（トークンを直接渡す）
      const joined = await join(token);

      if (joined === false) {
        throw new Error("Failed to join Agora channel");
      }

      // ホストの場合は音声を公開（自動公開を削除し、手動で行うように変更）
      if (shouldBeHost) {
        console.log("Host mode enabled. Please start audio manually.");
      }
    } catch (error) {
      console.error("Failed to join room:", error);
      alert("ルームへの参加に失敗しました");
    } finally {
      setIsJoining(false);
    }
  };

  const handleAddDeposit = async () => {
    if (!myChannel || depositAmountXRP <= 0) return;

    try {
      setIsAddingDeposit(true);
      console.log(
        "Adding deposit:",
        depositAmountXRP,
        "XRP to channel:",
        myChannel.channelId,
      );

      const result = await addDeposit({
        channelId: myChannel.channelId,
        additionalAmountXRP: depositAmountXRP,
      });

      if (!result.payload) {
        throw new Error("Payload data not available");
      }

      const payloadResponse = result.payload;
      console.log("Deposit payload created:", payloadResponse);

      if (!payloadResponse.uuid) {
        throw new Error("No UUID in payload response");
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
          window.open(payloadResponse.deeplink, "_blank");
        }
      }

      // 署名完了を待つ
      console.log("Waiting for deposit signature...");
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

          if (
            payloadResult.meta?.signed === true &&
            payloadResult.meta?.resolved === true
          ) {
            signed = true;
            console.log("✅ Deposit added successfully");

            // チャネル情報とルーム情報を再取得
            console.log("🔄 Refetching channel and room data...");
            const [channelResult, roomResult] = await Promise.all([
              refetchMyChannel(),
              refetchRoom()
            ]);
            
            console.log("📊 Updated data:", {
              channel: channelResult.data ? {
                channelId: channelResult.data.channelId.slice(0, 8) + "...",
                amount: dropsToXrp(channelResult.data.amount),
                lastAmount: channelResult.data.lastAmount ? dropsToXrp(channelResult.data.lastAmount) : "0"
              } : null,
              roomParticipants: roomResult.data?.participants.length
            });

            // QRコードを非表示
            setXummQrUrl(null);
            setXummQrCode(null);
            setIsAddingDeposit(false);
            setDepositAmountXRP(0);

            // 成功メッセージと次のアクション
            alert("✅ デポジットが追加されました！\n\n「参加する」ボタンでルームに参加できます。");
            
            console.log("🎯 Deposit complete - user can now join the room");
            return;
          } else if (
            payloadResult.meta?.resolved === true &&
            payloadResult.meta?.signed === false
          ) {
            console.log("Deposit cancelled");
            alert("デポジットの追加がキャンセルされました");
            break;
          } else if (payloadResult.meta?.expired === true) {
            console.log("Deposit expired");
            alert("デポジットの追加がタイムアウトしました");
            break;
          }
        } catch (pollError) {
          console.warn("Error polling payload result:", pollError);
        }

        if (!signed && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!signed) {
        throw new Error("Deposit addition timeout");
      }
    } catch (error) {
      console.error("Failed to add deposit:", error);
      alert("デポジットの追加に失敗しました");
    } finally {
      setXummQrUrl(null);
      setXummQrCode(null);
      setIsAddingDeposit(false);
      
      // 最終的にデータを再取得（失敗時も含めて）
      console.log("🔄 Final data refresh after deposit attempt");
      try {
        await Promise.all([
          refetchMyChannel(),
          refetchRoom()
        ]);
      } catch (refreshError) {
        console.warn("⚠️ Failed to refresh data after deposit:", refreshError);
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
    router.push("/rooms");
  };

  const handlePaymentChannelCreation = async () => {
    if (!room || !userId) return;

    try {
      setIsCreatingChannel(true);

      // 既存チャネルの確認
      const { data: existingChannel } = await refetchMyChannel();
      if (existingChannel) {
        console.log(
          "Found existing channel during creation:",
          existingChannel.channelId,
        );
        setPaymentChannelId(existingChannel.channelId);

        // 既存チャネルを使用してルームに参加
        setIsCreatingChannel(false);

        // サーバー側でルームに参加
        joinRoom({ roomId });

        // 支払いタイマーを開始
        const existingAmountXRP = existingChannel.lastAmount
          ? Number(dropsToXrp(existingChannel.lastAmount))
          : 0;
        startPaymentTimer(existingChannel.channelId, existingAmountXRP);

        // Agoraトークンを取得
        const { token } = await getAgoraToken({ roomId });
        setAgoraToken(token);

        // Agoraに接続
        const joinResult = await join(token);
        if (joinResult === false) {
          throw new Error("Failed to join Agora channel");
        }

        return;
      }

      // デフォルトは60分間の料金を計算（最小1 XRP）
      const defaultMinutes = 60;
      const defaultAmountXRP = Math.max(1, room.xrpPerMinute * defaultMinutes);

      // 初回の場合は金額を設定
      if (channelAmountXRP === 0) {
        setChannelAmountXRP(defaultAmountXRP);
        return; // UIを表示するためにここで一旦終了
      }

      // Payment Channel作成トランザクションを準備
      console.log(
        "Creating payment channel with amount:",
        channelAmountXRP,
        "XRP",
      );
      console.log("Room ID:", room.id);
      console.log("User ID:", userId);

      const result = await createPaymentChannel({
        roomId: room.id,
        amountXRP: channelAmountXRP,
      });
      console.log("Create payment channel result:", result);

      if (result.existingChannel && result.channel) {
        console.log("Using existing channel:", result.channel.channelId);
        setPaymentChannelId(result.channel.channelId);

        // 既存チャネルを使用してルームに参加
        setIsCreatingChannel(false);

        // サーバー側でルームに参加
        joinRoom({ roomId });

        // 支払いタイマーを開始
        const existingAmountXRP = result.channel.lastAmount
          ? Number(dropsToXrp(result.channel.lastAmount))
          : 0;
        startPaymentTimer(result.channel.channelId, existingAmountXRP);

        // Agoraトークンを取得
        const { token } = await getAgoraToken({ roomId });
        setAgoraToken(token);

        // Agoraに接続
        const joinResult = await join(token);
        if (joinResult === false) {
          throw new Error("Failed to join Agora channel");
        }

        return;
      }

      // すでにサーバー側でペイロードが作成されている
      if (!result.payload) {
        console.error("No payload in result:", result);
        throw new Error("Payload data not available");
      }

      if (result.transaction) {
        console.log(
          "Transaction details:",
          JSON.stringify(result.transaction, null, 2),
        );
      }

      const payloadResponse = result.payload;
      console.log("Using server-created payload:", payloadResponse);

      if (!payloadResponse.uuid) {
        throw new Error("No UUID in payload response");
      }

      // QRコードをUIに表示
      if (payloadResponse.qrUrl) {
        setXummQrCode(payloadResponse.qrUrl);
        console.log("QR Code URL:", payloadResponse.qrUrl);
      }

      // ディープリンクURL
      if (payloadResponse.deeplink) {
        setXummQrUrl(payloadResponse.deeplink);
        console.log("Deep link URL:", payloadResponse.deeplink);
        // モバイルの場合は自動的に開く
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
          window.open(payloadResponse.deeplink, "_blank");
        }
      }

      // 署名完了を待つ
      console.log("Waiting for signature...");
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

          console.log("Payload result:", {
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
          console.log(
            "Full meta:",
            JSON.stringify(payloadResult.meta, null, 2),
          );
          console.log(
            "Full response:",
            JSON.stringify(payloadResult.response, null, 2),
          );

          // 明確に署名された場合
          if (
            payloadResult.meta?.signed === true &&
            payloadResult.meta?.resolved === true
          ) {
            signed = true;
            console.log("Payment channel creation signed successfully");

            // チャネル作成を確認
            // PaymentChannelCreateの場合、Channel IDはトランザクション成功後に生成される
            // Xummから直接Channel IDが返ってこない場合があるので、
            // トランザクションハッシュから後で取得する必要がある

            const txHash =
              payloadResult.response?.txid || payloadResult.meta?.txid;
            console.log("Transaction hash:", txHash);

            if (txHash) {
              console.log(
                "Payment channel creation transaction submitted successfully",
              );

              // トランザクションが成功したので、チャネル情報を再取得
              // XRPLがトランザクションを処理するのを待つ
              await new Promise((resolve) => setTimeout(resolve, 3000));

              // チャネル情報を再取得
              const { data: newChannel } = await refetchMyChannel();

              if (newChannel) {
                console.log(
                  "Successfully retrieved new channel:",
                  newChannel.channelId,
                );
                setPaymentChannelId(newChannel.channelId);

                // チャネル作成成功後、QRコードを非表示
                setXummQrUrl(null);
                setXummQrCode(null);
                setIsCreatingChannel(false);

                // 自動的にルームに参加
                console.log(
                  "Channel created successfully, now joining room...",
                );
                setIsJoining(true);

                // サーバー側でルームに参加
                joinRoom({ roomId });

                // 支払いタイマーを開始
                startPaymentTimer(newChannel.channelId, 0);

                // Agoraトークンを取得して接続
                try {
                  const { token } = await getAgoraToken({ roomId });
                  setAgoraToken(token);

                  const joinResult = await join(token);
                  if (joinResult === false) {
                    throw new Error("Failed to join Agora channel");
                  }

                  setIsJoining(false);
                  console.log(
                    "Successfully joined room after channel creation",
                  );
                } catch (joinError) {
                  console.error(
                    "Failed to join after channel creation:",
                    joinError,
                  );
                  setIsJoining(false);
                  alert("チャネル作成後のルーム参加に失敗しました");
                }
              } else {
                // チャネルがまだ見つからない場合は、トランザクションハッシュを一時的に使用
                console.log(
                  "Channel not yet found, using transaction hash temporarily",
                );
                setPaymentChannelId(txHash);

                // QRコードを非表示
                setXummQrUrl(null);
                setXummQrCode(null);
                setIsCreatingChannel(false);

                // 数秒後に再度取得を試みる
                alert(
                  "ペイメントチャネルを作成中です。しばらくお待ちください...",
                );

                setTimeout(async () => {
                  const { data: retryChannel } = await refetchMyChannel();
                  if (retryChannel) {
                    console.log(
                      "Channel found on retry:",
                      retryChannel.channelId,
                    );
                    setPaymentChannelId(retryChannel.channelId);
                    alert(
                      "ペイメントチャネルが確認されました。もう一度「参加する」をクリックしてください。",
                    );
                  } else {
                    alert(
                      "ペイメントチャネルの確認に失敗しました。ページを更新してもう一度お試しください。",
                    );
                  }
                }, 5000);
              }
            } else {
              console.error("Transaction hash not found in payload result");
              console.error(
                "Available fields:",
                Object.keys(payloadResult.response || {}),
              );
            }
            break;
          }
          // 明確にキャンセルされた場合（resolvedがtrueでsignedがfalse、かつopenedがtrue）
          else if (
            payloadResult.meta?.resolved === true &&
            payloadResult.meta?.signed === false &&
            payloadResult.meta?.opened === true
          ) {
            console.log("Payment channel creation explicitly cancelled");
            alert("支払いチャネルの作成がキャンセルされました");
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
            console.log("Payment channel creation expired");
            alert(
              "支払いチャネルの作成がタイムアウトしました。もう一度お試しください。",
            );
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
            console.log("Payload still pending...", {
              resolved: payloadResult.meta?.resolved,
              signed: payloadResult.meta?.signed,
              opened: payloadResult.meta?.opened,
              expired: payloadResult.meta?.expired,
            });
          }
        } catch (pollError) {
          console.warn("Error polling payload result:", pollError);
        }

        // 次のポーリングまで待機
        if (!signed && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (!signed) {
        throw new Error("Payment channel creation timeout");
      }

      // この時点でチャネル作成は成功しているが、
      // 実際の参加処理は上記のnewChannel確認後に実行される
    } catch (error) {
      console.error("Payment channel creation error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "不明なエラー";
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

  const startPaymentTimer = (
    channelId?: string,
    existingAmountXRP?: number,
  ) => {
    const channelIdToUse = channelId || paymentChannelId;

    if (!channelIdToUse) {
      console.error("Cannot start payment timer without channel ID");
      return;
    }

    if (!room?.xrpPerMinute) {
      console.error("Cannot start payment timer without xrpPerMinute");
      return;
    }

    // Calculate initial seconds based on existing payment amount
    let totalSeconds = 0;
    let lastSignedAmount = existingAmountXRP || 0;

    if (existingAmountXRP && existingAmountXRP > 0) {
      // Calculate seconds that would produce at least the existing amount
      // Add extra seconds to ensure we're always above the last signed amount
      const baseSeconds = (existingAmountXRP / room.xrpPerMinute) * 60;
      // Add 1 extra second to ensure the amount is always greater
      totalSeconds = Math.ceil(baseSeconds) + 1;

      // Verify the calculated amount will be greater
      const verifyAmount = (totalSeconds / 60) * room.xrpPerMinute;
      const verifyRounded = Math.round(verifyAmount * 1000000) / 1000000;

      console.log("Resuming payment timer from existing amount:", {
        existingAmountXRP,
        calculatedSeconds: totalSeconds,
        baseSeconds,
        xrpPerMinute: room.xrpPerMinute,
        verifyAmount: verifyRounded,
        willBeGreater: verifyRounded > existingAmountXRP,
      });

      // If still not greater, add more seconds
      while (
        verifyRounded <= existingAmountXRP &&
        totalSeconds < baseSeconds + 10
      ) {
        totalSeconds++;
        const newAmount = (totalSeconds / 60) * room.xrpPerMinute;
        const newRounded = Math.round(newAmount * 1000000) / 1000000;
        if (newRounded > existingAmountXRP) {
          console.log(
            "Added extra seconds to ensure amount is greater:",
            totalSeconds,
          );
          break;
        }
      }
    }

    setTotalPaidSeconds(totalSeconds);

    const interval = setInterval(() => {
      totalSeconds += 1;
      setTotalPaidSeconds(totalSeconds);

      // 1秒ごとに支払い署名を送信（仕様通り）
      const totalXrp = (totalSeconds / 60) * room.xrpPerMinute;
      // Round to 6 decimal places (XRP precision limit)
      const roundedXrp = Math.round(totalXrp * 1000000) / 1000000;

      // Only sign if the amount is greater than the last signed amount
      if (roundedXrp > lastSignedAmount) {
        console.log("Signing payment:", {
          channelId: channelIdToUse,
          amountXRP: roundedXrp,
          totalSeconds,
          xrpPerMinute: room.xrpPerMinute,
          lastSignedAmount,
        });

        lastSignedAmount = roundedXrp;

        signPayment({
          channelId: channelIdToUse,
          amountXRP: roundedXrp,
        });
      } else {
        console.log("Skipping payment signature (amount not increased yet):", {
          currentAmount: roundedXrp,
          lastSignedAmount,
          totalSeconds,
        });
      }
    }, 1000);

    paymentIntervalRef.current = interval;
  };

  const handleStartRoom = () => {
    console.log("🚀 handleStartRoom clicked", { roomId, room: room?.status });
    try {
      startRoom(
        { roomId },
        {
          onSuccess: () => {
            console.log("✅ Room started successfully");
            // 状態を更新
            refetchRoom();
          },
          onError: (error) => {
            console.error("❌ Failed to start room:", error);
            alert(`ルーム開始に失敗しました: ${error.message}`);
          },
        },
      );
    } catch (error) {
      console.error("❌ Error in handleStartRoom:", error);
    }
  };

  const handleEndRoom = () => {
    console.log("🚀 handleEndRoom clicked", { roomId, room: room?.status });
    if (confirm("本当にルームを終了しますか？")) {
      try {
        endRoom(
          { roomId },
          {
            onSuccess: () => {
              console.log("✅ Room ended successfully");
              router.push("/rooms");
            },
            onError: (error) => {
              console.error("❌ Failed to end room:", error);
              alert(`ルーム終了に失敗しました: ${error.message}`);
            },
          },
        );
      } catch (error) {
        console.error("❌ Error in handleEndRoom:", error);
      }
    }
  };

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (paymentIntervalRef.current) {
        clearInterval(paymentIntervalRef.current);
      }
      // leave関数は非同期なので、アンマウント時には呼ばない
      // useAgoraフック内でクリーンアップが行われる
    };
  }, []);

  // ブラウザを閉じる時の処理
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isJoined && userId) {
        // 同期的にleaveリクエストを送信
        navigator.sendBeacon(
          `/api/room/leave`,
          JSON.stringify({ roomId, userId }),
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isJoined, roomId, userId]);

  // ページ遷移時の処理
  useEffect(() => {
    // ページ遷移時に退室処理を実行
    const handleRouteChange = () => {
      if (isJoined) {
        console.log("Route change detected, leaving room");
        // 支払いタイマーを停止
        if (paymentIntervalRef.current) {
          clearInterval(paymentIntervalRef.current);
          paymentIntervalRef.current = null;
        }
        // サーバー側の退室処理
        leaveRoom({ roomId });
        // sendBeaconでも退室処理を送信
        if (userId) {
          navigator.sendBeacon(
            `/api/room/leave`,
            JSON.stringify({ roomId, userId }),
          );
        }
      }
    };

    // popstateイベント（ブラウザの戻る/進むボタン）を監視
    window.addEventListener("popstate", handleRouteChange);

    // コンポーネントのアンマウント時（ページ遷移時）に退室処理
    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      // ページを離れる時に退室処理を実行
      if (isJoined) {
        console.log("Component unmounting, leaving room");
        // 支払いタイマーを停止
        if (paymentIntervalRef.current) {
          clearInterval(paymentIntervalRef.current);
          paymentIntervalRef.current = null;
        }
        // Agoraの状態をリセット（leave関数は非同期なので呼ばない）
        // サーバー側の退室処理のみ実行
        leaveRoom({ roomId });
        // sendBeaconでも退室処理を送信（念のため）
        if (userId) {
          navigator.sendBeacon(
            `/api/room/leave`,
            JSON.stringify({ roomId, userId }),
          );
        }
      }
    };
  }, [isJoined, roomId, leaveRoom, userId]);

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

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <RoomInfo 
            room={room as any} 
            participantCount={room.participants.length} 
          />

          <div className="rounded-lg bg-white/10 p-6">
            {/* デバッグ用テストボタン */}
            <div className="mb-4 p-4 bg-red-900/20 border border-red-500 rounded-lg">
              <h3 className="text-red-300 font-semibold mb-2">🔧 デバッグ用テストエリア</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    console.log("🧪 Test button 1 clicked!");
                    alert("テストボタン1が正常に動作しています！");
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded mr-2"
                >
                  テストボタン1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.log("🧪 Test button 2 clicked!");
                    setIsAddingDeposit(!isAddingDeposit);
                    console.log("isAddingDeposit toggled to:", !isAddingDeposit);
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded mr-2"
                >
                  テストボタン2 (isAddingDeposit切り替え)
                </button>
                <p className="text-xs text-red-200">
                  現在の状態: isAddingDeposit = {String(isAddingDeposit)}, depositAmountXRP = {depositAmountXRP}
                </p>
              </div>
            </div>
            
            {isAddingDeposit ? (
              <div className="text-center">
                <p className="mb-4 text-gray-300 text-lg font-semibold">🔄 デポジットを追加</p>
                <div className="mb-4 p-3 bg-blue-900/30 rounded-lg">
                  <p className="text-blue-300 text-sm mb-2">現在の状態:</p>
                  <pre className="text-xs text-blue-100">
                    {JSON.stringify({
                      isAddingDeposit,
                      depositAmountXRP,
                      xummQrCode: !!xummQrCode,
                      myChannel: myChannel ? {
                        channelId: myChannel.channelId.slice(0, 8) + "...",
                        amount: dropsToXrp(myChannel.amount),
                        lastAmount: myChannel.lastAmount ? dropsToXrp(myChannel.lastAmount) : "0"
                      } : null
                    }, null, 2)}
                  </pre>
                </div>
                {!xummQrCode ? (
                  <>
                    <div className="mb-6 max-w-sm mx-auto">
                      <label className="block text-sm text-gray-400 mb-2">
                        追加する金額 (XRP)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={depositAmountXRP}
                          onChange={(e) =>
                            setDepositAmountXRP(
                              Math.max(0.1, parseFloat(e.target.value) || 0),
                            )
                          }
                          min="0.1"
                          step="1"
                          className="flex-1 rounded bg-white/10 px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-gray-400">XRP</span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        追加後:{" "}
                        {Math.ceil(
                          (depositAmountXRP +
                            (myChannel
                              ? Number(
                                  dropsToXrp(
                                    BigInt(myChannel.amount) -
                                      BigInt(myChannel.lastAmount || "0"),
                                  ),
                                )
                              : 0)) /
                            (room.xrpPerMinute || 0.01),
                        )}
                        分間の視聴が可能
                      </p>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          console.log("🚀 Add deposit button clicked", { depositAmountXRP, myChannel });
                          handleAddDeposit();
                        }}
                        disabled={depositAmountXRP <= 0}
                        className="rounded-full bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700 disabled:opacity-50"
                      >
                        追加する
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          console.log("🚀 Cancel deposit button clicked");
                          setIsAddingDeposit(false);
                          setDepositAmountXRP(0);
                        }}
                        className="rounded-full bg-gray-600 px-6 py-2 transition hover:bg-gray-700"
                      >
                        キャンセル
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-4 text-gray-300">
                      {depositAmountXRP} XRPを追加中...
                    </p>
                    <div className="mb-4">
                      <img
                        src={xummQrCode}
                        alt="Xumm QR Code"
                        className="mx-auto rounded-lg"
                        style={{ maxWidth: "300px" }}
                      />
                    </div>
                    <p className="text-gray-400 text-sm mb-2">
                      XamanウォレットでこのQRコードをスキャンしてください
                    </p>
                    {xummQrUrl && (
                      <a
                        href={xummQrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm underline"
                      >
                        モバイルで開く
                      </a>
                    )}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => {
                          console.log("🚀 Cancel QR button clicked");
                          setXummQrUrl(null);
                          setXummQrCode(null);
                          setIsAddingDeposit(false);
                          setDepositAmountXRP(0);
                        }}
                        className="rounded bg-gray-600 px-6 py-2 text-sm transition hover:bg-gray-700"
                      >
                        キャンセル
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : isCreatingChannel ? (
              <div className="text-center">
                {channelAmountXRP > 0 && !xummQrCode ? (
                  <>
                    <p className="mb-4 text-gray-300">支払いチャネルの作成</p>
                    <div className="mb-6 max-w-sm mx-auto">
                      <label className="block text-sm text-gray-400 mb-2">
                        チャネルに預ける金額 (XRP)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={channelAmountXRP}
                          onChange={(e) =>
                            setChannelAmountXRP(
                              Math.max(0.1, parseFloat(e.target.value) || 0),
                            )
                          }
                          min="0.1"
                          step="1"
                          className="flex-1 rounded bg-white/10 px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-gray-400">XRP</span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        推奨: {Math.ceil(channelAmountXRP / room.xrpPerMinute)}
                        分間の視聴が可能
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        料金: {room.xrpPerMinute} XRP/分
                      </p>
                    </div>
                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => handlePaymentChannelCreation()}
                        className="rounded-full bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700"
                      >
                        チャネルを作成
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelPaymentChannel}
                        className="rounded-full bg-gray-600 px-6 py-2 transition hover:bg-gray-700"
                      >
                        キャンセル
                      </button>
                    </div>
                  </>
                ) : xummQrCode ? (
                  <>
                    <p className="mb-4 text-gray-300">
                      {channelAmountXRP} XRPの支払いチャネルを作成中...
                    </p>
                    <div className="mb-4">
                      <img
                        src={xummQrCode}
                        alt="Xumm QR Code"
                        className="mx-auto rounded-lg"
                        style={{ maxWidth: "300px" }}
                      />
                    </div>
                    <p className="text-gray-400 text-sm mb-2">
                      XamanウォレットでこのQRコードをスキャンしてください
                    </p>
                    {xummQrUrl && (
                      <a
                        href={xummQrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm underline"
                      >
                        モバイルで開く
                      </a>
                    )}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={handleCancelPaymentChannel}
                        className="rounded bg-gray-600 px-6 py-2 text-sm transition hover:bg-gray-700"
                      >
                        キャンセル
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm">
                    Xamanウォレットでトランザクションを準備中...
                  </p>
                )}
              </div>
            ) : !isJoined ? (
              <div className="text-center">
                {room.status === "ENDED" ? (
                  <p className="mb-4 text-gray-400">このルームは終了しました</p>
                ) : (
                  <>
                    <p className="mb-4 text-gray-300">
                      {room.status === "WAITING"
                        ? "ルームはまだ開始されていません"
                        : "ルームに参加しますか？"}
                    </p>
                    {!isHost && room.xrpPerMinute && room.xrpPerMinute > 0 && (
                      <div className="mb-4 rounded-lg bg-yellow-900/50 p-4">
                        <p className="text-yellow-300 text-sm mb-2">
                          このルームは有料です（{room.xrpPerMinute} XRP/分）
                        </p>
                        {isLoadingChannel ? (
                          <p className="text-gray-400 text-sm">
                            ペイメントチャネルを確認中...
                          </p>
                        ) : !myChannel ? (
                          <p className="text-yellow-300 text-sm">
                            参加するにはペイメントチャネルの作成が必要です
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-green-300 text-sm font-semibold">
                              ✓ 既存のペイメントチャネルが見つかりました
                            </p>
                            <div className="bg-black/30 rounded p-3 space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-400">
                                  デポジット額:
                                </span>
                                <span className="text-white">
                                  {dropsToXrp(myChannel.amount)} XRP
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-400">
                                  使用済み額:
                                </span>
                                <span className="text-white">
                                  {myChannel.lastAmount
                                    ? dropsToXrp(myChannel.lastAmount)
                                    : "0"}{" "}
                                  XRP
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-400">残高:</span>
                                <span className="text-green-300 font-semibold">
                                  {dropsToXrp(
                                    BigInt(myChannel.amount) -
                                      BigInt(myChannel.lastAmount || "0"),
                                  )}{" "}
                                  XRP
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-400">
                                  視聴可能時間:
                                </span>
                                <span
                                  className={
                                    Math.floor(
                                      Number(
                                        dropsToXrp(
                                          BigInt(myChannel.amount) -
                                            BigInt(myChannel.lastAmount || "0"),
                                        ),
                                      ) / room.xrpPerMinute,
                                    ) < 5
                                      ? "text-red-400"
                                      : "text-yellow-300"
                                  }
                                >
                                  約
                                  {Math.floor(
                                    Number(
                                      dropsToXrp(
                                        BigInt(myChannel.amount) -
                                          BigInt(myChannel.lastAmount || "0"),
                                      ),
                                    ) / room.xrpPerMinute,
                                  )}
                                  分
                                </span>
                              </div>
                              <div className="pt-2 border-t border-gray-700">
                                <a
                                  href={`${env.NEXT_PUBLIC_XRPL_NETWORK.includes("testnet") ? "https://testnet.xrpl.org" : "https://livenet.xrpl.org"}/transactions/${myChannel.channelId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 text-xs underline flex items-center gap-1"
                                >
                                  エクスプローラーで確認
                                  <svg
                                    className="w-3 h-3"
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
                                    BigInt(myChannel.lastAmount || "0"),
                                ),
                              ) / room.xrpPerMinute,
                            ) < 5 && (
                              <div className="mt-2 space-y-2">
                                <p className="text-red-400 text-xs">
                                  ⚠️
                                  残高が少なくなっています。追加のデポジットが必要かもしれません。
                                </p>
                                <div className="p-2 bg-blue-900/30 rounded-lg">
                                  <p className="text-xs text-blue-300 mb-2">デバッグ情報:</p>
                                  <pre className="text-xs text-blue-100">
                                    {JSON.stringify({
                                      isAddingDeposit,
                                      depositAmountXRP,
                                      roomXrpPerMinute: room.xrpPerMinute,
                                    }, null, 2)}
                                  </pre>
                                </div>
                                <button
                                  type="button"
                                  onMouseEnter={() => console.log("🖱️ Button mouse enter")}
                                  onMouseDown={() => console.log("🖱️ Button mouse down")}
                                  onMouseUp={() => console.log("🖱️ Button mouse up")}
                                  onClick={(e) => {
                                    console.log("🚀 Deposit button clicked!", {
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
                                        "Setting deposit amount to:",
                                        defaultDeposit,
                                        "XRP (rate:",
                                        room.xrpPerMinute,
                                        "XRP/min)",
                                      );
                                      setDepositAmountXRP(defaultDeposit);
                                      setIsAddingDeposit(true);
                                      console.log("✅ isAddingDeposit set to true");
                                    } catch (error) {
                                      console.error("❌ Error in button click handler:", error);
                                    }
                                  }}
                                  className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg shadow-md transition-all duration-200 border-2 border-yellow-400"
                                  style={{ 
                                    position: 'relative', 
                                    zIndex: 9999,
                                    pointerEvents: 'auto'
                                  }}
                                >
                                  デポジットを追加 (テスト版)
                                </button>
                                <p className="text-xs text-gray-400 mt-1">
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
                      <div className="mb-4 p-3 bg-blue-900/20 rounded-lg">
                        <p className="text-blue-300 text-sm mb-2">参加ステータス:</p>
                        <div className="text-xs text-blue-100 space-y-1">
                          <div className="flex justify-between">
                            <span>ユーザーID:</span>
                            <span>{userId ? userId.slice(0, 8) + "..." : "未設定"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>ホスト:</span>
                            <span>{isHost ? "はい" : "いいえ"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>チャネル:</span>
                            <span>{myChannel ? "あり" : "なし"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>参加状態:</span>
                            <span>{isJoined ? "参加済み" : "未参加"}</span>
                          </div>
                          {!isHost && myChannel && (
                            <div className="flex justify-between">
                              <span>視聴可能時間:</span>
                              <span className={
                                Math.floor(
                                  Number(
                                    dropsToXrp(
                                      BigInt(myChannel.amount) -
                                        BigInt(myChannel.lastAmount || "0"),
                                    ),
                                  ) / (room.xrpPerMinute || 0.01),
                                ) < 5
                                  ? "text-red-400 font-semibold"
                                  : "text-green-300"
                              }>
                                約{Math.floor(
                                  Number(
                                    dropsToXrp(
                                      BigInt(myChannel.amount) -
                                        BigInt(myChannel.lastAmount || "0"),
                                    ),
                                  ) / (room.xrpPerMinute || 0.01),
                                )}分
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 参加ボタン */}
                      <button
                        type="button"
                        onClick={(e) => {
                          console.log("🚀 Join room button clicked", {
                            isJoining,
                            isLoadingChannel,
                            isHost,
                            myChannel: !!myChannel,
                            userId,
                            roomStatus: room.status,
                          });
                          handleJoinRoom();
                        }}
                        disabled={
                          isJoining ||
                          isLoadingChannel ||
                          (!isHost && 
                           room.xrpPerMinute > 0 && 
                           (!myChannel || 
                            Math.floor(
                              Number(
                                dropsToXrp(
                                  BigInt(myChannel.amount) -
                                    BigInt(myChannel.lastAmount || "0"),
                                ),
                              ) / (room.xrpPerMinute || 0.01),
                            ) <= 0))
                        }
                        className="w-full rounded-full bg-blue-600 px-8 py-3 font-semibold text-lg transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isJoining
                          ? "参加中..."
                          : isLoadingChannel
                            ? "チャネル確認中..."
                            : room.status === "WAITING"
                              ? "ルームに参加 (開始待ち)"
                              : "ルームに参加"}
                      </button>
                      
                      {/* 参加できない理由の表示 */}
                      {!isHost && room.xrpPerMinute > 0 && (
                        <>
                          {!myChannel && (
                            <p className="mt-2 text-yellow-300 text-sm text-center">
                              💳 参加にはペイメントチャネルの作成が必要です
                            </p>
                          )}
                          {myChannel && 
                           Math.floor(
                             Number(
                               dropsToXrp(
                                 BigInt(myChannel.amount) -
                                   BigInt(myChannel.lastAmount || "0"),
                               ),
                             ) / (room.xrpPerMinute || 0.01),
                           ) <= 0 && (
                            <p className="mt-2 text-red-300 text-sm text-center">
                              ⚠️ 残高不足です。デポジットを追加してください
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : isCreatingChannel ? (
              <div className="text-center">
                <p className="mb-4 text-gray-300">支払いチャネルを作成中...</p>
                {xummQrCode ? (
                  <>
                    <div className="mb-4">
                      <img
                        src={xummQrCode}
                        alt="Xumm QR Code"
                        className="mx-auto rounded-lg"
                        style={{ maxWidth: "300px" }}
                      />
                    </div>
                    <p className="text-gray-400 text-sm mb-2">
                      XamanウォレットでこのQRコードをスキャンしてください
                    </p>
                    {xummQrUrl && (
                      <a
                        href={xummQrUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-sm underline"
                      >
                        モバイルで開く
                      </a>
                    )}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={handleCancelPaymentChannel}
                        className="rounded bg-gray-600 px-6 py-2 text-sm transition hover:bg-gray-700"
                      >
                        キャンセル
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm">
                    Xamanウォレットでトランザクションを準備中...
                  </p>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {canSpeak && !isPublished && (
                      <button
                        type="button"
                        onClick={async () => {
                          console.log("🚀 Starting audio publication", { canSpeak, isPublished, connectionState });
                          try {
                            console.log(
                              `Current connection state: ${connectionState}`,
                            );
                            // 接続が確立されるまで待つ
                            if (connectionState !== "CONNECTED") {
                              alert(
                                "接続が確立されていません。もう少し待ってから再試行してください。",
                              );
                              return;
                            }
                            await publishAudio();
                            console.log("✅ Audio publication started successfully");
                          } catch (error) {
                            console.error("❌ Failed to publish audio:", error);
                            const errorMessage =
                              error instanceof Error
                                ? error.message
                                : "Unknown error";
                            alert(
                              `音声の公開に失敗しました: ${errorMessage}\n\n接続状態: ${connectionState}`,
                            );
                          }
                        }}
                        className="rounded-full bg-green-600 px-6 py-2 font-semibold transition hover:bg-green-700"
                      >
                        音声を開始
                      </button>
                    )}
                    {isPublished && (
                      <button
                        type="button"
                        onClick={() => {
                          console.log("🚀 Toggling mute", { isMuted, isPublished });
                          toggleMute();
                        }}
                        className={`rounded-full px-6 py-2 font-semibold transition ${
                          isMuted
                            ? "bg-red-600 hover:bg-red-700"
                            : "bg-gray-600 hover:bg-gray-700"
                        }`}
                      >
                        {isMuted ? "ミュート解除" : "ミュート"}
                      </button>
                    )}
                    {!shouldBeHost &&
                      !participant?.canSpeak &&
                      !participant?.speakRequestedAt && (
                        <button
                          type="button"
                          onClick={() => {
                            console.log("🚀 Requesting speak permission", { roomId, participant });
                            requestSpeak({ roomId });
                          }}
                          className="rounded-full bg-purple-600 px-6 py-2 font-semibold transition hover:bg-purple-700"
                        >
                          発言権をリクエスト
                        </button>
                      )}
                    {!shouldBeHost &&
                      participant?.speakRequestedAt &&
                      !participant?.canSpeak && (
                        <button
                          type="button"
                          disabled
                          className="rounded-full bg-gray-500 px-6 py-2 font-semibold opacity-50"
                        >
                          リクエスト中...
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={handleLeaveRoom}
                      className="rounded-full bg-red-600 px-6 py-2 font-semibold transition hover:bg-red-700"
                    >
                      退出
                    </button>
                  </div>
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
                  {isHost && (
                    <p className="text-green-400">あなたはホストです</p>
                  )}
                  {participant?.canSpeak && !shouldBeHost && (
                    <p className="text-blue-400">発言権があります</p>
                  )}
                  {canSpeak && !isPublished && (
                    <p className="text-yellow-400">音声を開始してください</p>
                  )}

                  {/* Audio Level Indicators */}
                  {isPublished && (
                    <div className="mt-4">
                      <AudioLevelIndicator
                        level={localAudioLevel}
                        label="自分の音声"
                        isMuted={isMuted}
                      />
                    </div>
                  )}

                  {remoteAudioLevels && remoteAudioLevels.size > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-gray-300 text-xs font-semibold">
                        接続中のユーザー音声レベル:
                      </p>
                      {Array.from(remoteAudioLevels.entries()).map(
                        ([uid, level]) => {
                          // Find the participant by matching the uid
                          const remoteParticipant = room.participants.find(
                            (p) => {
                              // Generate uid from userId
                              let userUid = 0;
                              for (let i = 0; i < p.userId.length; i++) {
                                const hash =
                                  (userUid << 5) -
                                  userUid +
                                  p.userId.charCodeAt(i);
                                userUid = hash & hash;
                              }
                              userUid = Math.abs(userUid) % 1000000;
                              return userUid === uid;
                            },
                          ) as ParticipantWithAllFields | undefined;

                          const label = remoteParticipant
                            ? remoteParticipant.user.nickname ||
                              remoteParticipant.user.walletAddress.slice(0, 8) +
                                "..."
                            : `User ${uid}`;

                          return (
                            <AudioLevelIndicator
                              key={uid}
                              level={level}
                              label={label}
                            />
                          );
                        },
                      )}
                    </div>
                  )}

                  {paymentChannelId &&
                    room?.xrpPerMinute &&
                    room.xrpPerMinute > 0 &&
                    myChannel && (
                      <div className="mt-2 rounded bg-purple-900/50 p-2">
                        <p className="text-purple-300 text-xs">支払い状況</p>
                        <p className="font-mono text-sm">
                          {Math.floor(totalPaidSeconds / 60)}分
                          {totalPaidSeconds % 60}秒 ={" "}
                          {(
                            Math.round(
                              (totalPaidSeconds / 60) *
                                room.xrpPerMinute *
                                1000000,
                            ) / 1000000
                          ).toFixed(6)}{" "}
                          XRP
                        </p>
                        <p className="text-purple-400 text-xs">
                          Channel: {paymentChannelId.slice(0, 8)}...
                        </p>
                        {(() => {
                          const depositAmount = Number(
                            dropsToXrp(myChannel.amount),
                          );
                          const usedAmount =
                            (totalPaidSeconds / 60) * room.xrpPerMinute;
                          const remainingAmount = depositAmount - usedAmount;
                          const remainingMinutes = Math.floor(
                            remainingAmount / room.xrpPerMinute,
                          );

                          return (
                            <>
                              <p className="text-purple-400 text-xs mt-1">
                                残高: {remainingAmount.toFixed(6)} XRP (約
                                {remainingMinutes}分)
                              </p>
                              {remainingMinutes < 5 && (
                                <div className="mt-2">
                                  <div className="p-2 bg-blue-900/30 rounded-lg mb-2">
                                    <p className="text-xs text-blue-300 mb-1">デバッグ情報 (支払い中):</p>
                                    <pre className="text-xs text-blue-100">
                                      {JSON.stringify({
                                        isAddingDeposit,
                                        depositAmountXRP,
                                        remainingMinutes,
                                        roomXrpPerMinute: room.xrpPerMinute,
                                      }, null, 2)}
                                    </pre>
                                  </div>
                                  <button
                                    type="button"
                                    onMouseEnter={() => console.log("🖱️ Payment deposit button mouse enter")}
                                    onMouseDown={() => console.log("🖱️ Payment deposit button mouse down")}
                                    onMouseUp={() => console.log("🖱️ Payment deposit button mouse up")}
                                    onClick={(e) => {
                                      console.log("🚀 Payment deposit button clicked!", {
                                        event: e,
                                        currentTarget: e.currentTarget,
                                        target: e.target,
                                        isAddingDeposit,
                                        room: room?.xrpPerMinute,
                                        remainingMinutes,
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
                                          "Setting deposit amount to:",
                                          defaultDeposit,
                                          "XRP (rate:",
                                          room.xrpPerMinute,
                                          "XRP/min)",
                                        );
                                        setDepositAmountXRP(defaultDeposit);
                                        setIsAddingDeposit(true);
                                        console.log("✅ isAddingDeposit set to true");
                                      } catch (error) {
                                        console.error("❌ Error in payment deposit button click handler:", error);
                                      }
                                    }}
                                    className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold rounded-lg shadow-md transition-all duration-200 border-2 border-yellow-400"
                                    style={{ 
                                      position: 'relative', 
                                      zIndex: 9999,
                                      pointerEvents: 'auto'
                                    }}
                                  >
                                    デポジットを追加 (支払い中)
                                  </button>
                                  <p className="text-xs text-gray-400 mt-1">
                                    ボタンが反応しない場合は、ブラウザのコンソールを確認してください
                                  </p>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    )}
                  {isHost &&
                    incomingChannels &&
                    incomingChannels.length > 0 && (
                      <div className="mt-2 rounded bg-green-900/50 p-2">
                        <p className="text-green-300 text-xs font-semibold mb-2">
                          受信Payment Channels
                        </p>
                        <div className="space-y-2">
                          {incomingChannels.map((ch) => {
                            const depositAmount = Number(dropsToXrp(ch.amount));
                            const paidAmount = ch.lastAmount
                              ? Number(dropsToXrp(ch.lastAmount))
                              : 0;
                            const remainingAmount = depositAmount - paidAmount;
                            const paidMinutes = Math.floor(
                              paidAmount / (room?.xrpPerMinute || 0.01),
                            );
                            const paidSeconds =
                              Math.floor(
                                (paidAmount / (room?.xrpPerMinute || 0.01)) *
                                  60,
                              ) % 60;

                            return (
                              <div
                                key={ch.id}
                                className="bg-black/30 rounded p-2 text-xs"
                              >
                                <div className="flex justify-between items-start mb-1">
                                  <span className="text-green-400 font-medium">
                                    {ch.sender.nickname ||
                                      ch.sender.walletAddress.slice(0, 8)}
                                    ...
                                  </span>
                                  <span className="text-white font-mono">
                                    {paidAmount.toFixed(6)} XRP
                                  </span>
                                </div>
                                <div className="space-y-1 text-gray-300">
                                  <div className="flex justify-between">
                                    <span>デポジット:</span>
                                    <span className="text-gray-100">
                                      {depositAmount.toFixed(6)} XRP
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>残高:</span>
                                    <span
                                      className={
                                        remainingAmount < 1
                                          ? "text-red-400"
                                          : "text-gray-100"
                                      }
                                    >
                                      {remainingAmount.toFixed(6)} XRP
                                    </span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>視聴時間:</span>
                                    <span className="text-gray-100">
                                      {paidMinutes}分{paidSeconds}秒
                                    </span>
                                  </div>
                                  {ch.updatedAt && (
                                    <div className="flex justify-between">
                                      <span>最終更新:</span>
                                      <span className="text-gray-100">
                                        {typeof window !== "undefined"
                                          ? new Date(
                                              ch.updatedAt,
                                            ).toLocaleTimeString("ja-JP")
                                          : "--:--:--"}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-2 pt-2 border-t border-green-700">
                          <div className="flex justify-between text-xs">
                            <span className="text-green-300">合計収益:</span>
                            <span className="text-green-100 font-mono font-semibold">
                              {incomingChannels
                                .reduce(
                                  (sum, ch) =>
                                    sum +
                                    (ch.lastAmount
                                      ? Number(dropsToXrp(ch.lastAmount))
                                      : 0),
                                  0,
                                )
                                .toFixed(6)}{" "}
                              XRP
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
