'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '~/trpc/react';
import { subscribeToPayload } from '~/lib/xumm';

export default function CreateRoomPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMode, setPaymentMode] = useState<'PAYMENT_CHANNEL' | 'NFT_TICKET'>('PAYMENT_CHANNEL');
  const [xrpPerMinute, setXrpPerMinute] = useState(0.01);
  const [nftTicketPrice, setNftTicketPrice] = useState(1);
  const [nftTicketImage, setNftTicketImage] = useState<string>('');
  const [imagePreview, setImagePreview] = useState<string>('');
  const [showMinterAuth, setShowMinterAuth] = useState(false);
  const [isAuthorizingMinter, setIsAuthorizingMinter] = useState(false);
  const [minterAuthQrUrl, setMinterAuthQrUrl] = useState<string | null>(null);

  const createRoomMutation = api.room.create.useMutation();
  const { data: minterSettings, refetch: refetchMinterSettings } = api.room.checkNFTokenMinterSettings.useQuery(
    undefined,
    { enabled: !!userId }
  );
  const authorizeMinterMutation = api.room.authorizeMinter.useMutation();
  const confirmMinterAuthorizationMutation = api.room.confirmMinterAuthorization.useMutation();

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    setUserId(storedUserId);
    setIsCheckingAuth(false);
    
    if (!storedUserId) {
      router.push('/auth/signin');
    }
  }, [router]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        alert('画像サイズは5MB以下にしてください');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setNftTicketImage(base64);
        setImagePreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    if (!title.trim()) {
      alert('タイトルを入力してください');
      return;
    }

    if (paymentMode === 'NFT_TICKET' && !nftTicketImage) {
      alert('NFTチケット画像をアップロードしてください');
      return;
    }

    // NFTチケットモードの場合、Minter設定を確認
    if (paymentMode === 'NFT_TICKET') {
      // 設定を再確認
      const currentSettings = await refetchMinterSettings();
      if (!currentSettings.data?.isAuthorized) {
        setShowMinterAuth(true);
        return;
      }
    }

    try {
      const result = await createRoomMutation.mutateAsync({
        title,
        description,
        paymentMode,
        xrpPerMinute,
        nftTicketPrice: paymentMode === 'NFT_TICKET' ? nftTicketPrice : undefined,
        nftTicketImage: paymentMode === 'NFT_TICKET' ? nftTicketImage : undefined,
      });

      router.push(`/rooms/${result.id}`);
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('ルームの作成に失敗しました');
    }
  };

  const handleAuthorizeMinter = async () => {
    if (isAuthorizingMinter) return;

    setIsAuthorizingMinter(true);
    
    try {
      const result = await authorizeMinterMutation.mutateAsync();
      
      if (result.payload.qrUrl) {
        // QRコードをモーダル内に表示
        setMinterAuthQrUrl(result.payload.qrUrl);
      }

      if (result.payload.uuid) {
        await subscribeToPayload(
          result.payload.uuid,
          async (data) => {
            if (data.signed === true) {
              // AccountSetトランザクションが完了
              console.log('AccountSet transaction completed with txid:', data.txid);
              
              // トランザクションIDを使ってデータベースを更新
              try {
                // confirmMinterAuthorizationエンドポイントを呼び出す
                await confirmMinterAuthorizationMutation.mutateAsync({
                  transactionHash: data.txid,
                });
                
                // 設定を再取得
                const updatedSettings = await refetchMinterSettings();
                
                if (updatedSettings.data?.isAuthorized) {
                  // 認可成功
                  console.log('NFTokenMinter authorization confirmed!');
                  setShowMinterAuth(false);
                  setIsAuthorizingMinter(false);
                  setMinterAuthQrUrl(null);
                  
                  // ルーム作成を続行
                  alert('NFTokenMinter認可が完了しました。ルームを作成します。');
                  
                  // モーダルを閉じてからフォームを再送信
                  // 少し遅延を入れて、UIの更新を待つ
                  setTimeout(() => {
                    // フォームを再送信する代わりに、直接ルーム作成を実行
                    handleSubmit(new Event('submit', { cancelable: true }) as any);
                  }, 100);
                } else {
                  alert('認可の確認に失敗しました。もう一度お試しください。');
                  setIsAuthorizingMinter(false);
                  setMinterAuthQrUrl(null);
                }
              } catch (error) {
                console.error('Failed to confirm minter authorization:', error);
                alert('認可の確認に失敗しました。');
                setIsAuthorizingMinter(false);
                setMinterAuthQrUrl(null);
              }
            } else if (data.signed === false) {
              setIsAuthorizingMinter(false);
              setMinterAuthQrUrl(null);
              alert('認可がキャンセルされました');
            }
          }
        );
      }
    } catch (error) {
      console.error('Failed to authorize minter:', error);
      alert('Minter認可に失敗しました');
      setIsAuthorizingMinter(false);
      setMinterAuthQrUrl(null);
    }
  };

  if (isCheckingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-8 font-bold text-3xl">ルーム作成</h1>

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          <div>
            <label htmlFor="title" className="mb-2 block font-semibold text-sm">
              タイトル *
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg bg-white/10 px-4 py-3 text-white placeholder-white/50"
              placeholder="ルームのタイトルを入力"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="mb-2 block font-semibold text-sm">
              説明
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg bg-white/10 px-4 py-3 text-white placeholder-white/50"
              placeholder="ルームの説明を入力"
              rows={3}
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold text-sm">
              支払いモード *
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="PAYMENT_CHANNEL"
                  checked={paymentMode === 'PAYMENT_CHANNEL'}
                  onChange={(e) => setPaymentMode(e.target.value as 'PAYMENT_CHANNEL')}
                  className="mr-2"
                />
                <span>ペイメントチャネル (分単位課金)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="NFT_TICKET"
                  checked={paymentMode === 'NFT_TICKET'}
                  onChange={(e) => setPaymentMode(e.target.value as 'NFT_TICKET')}
                  className="mr-2"
                />
                <span>NFTチケット (一回購入)</span>
              </label>
            </div>
          </div>

          {paymentMode === 'PAYMENT_CHANNEL' && (
            <div>
              <label htmlFor="xrpPerMinute" className="mb-2 block font-semibold text-sm">
                分単価 (XRP/分)
              </label>
              <input
                id="xrpPerMinute"
                type="number"
                value={xrpPerMinute}
                onChange={(e) => setXrpPerMinute(Number(e.target.value))}
                min="0"
                step="0.001"
                className="w-full rounded-lg bg-white/10 px-4 py-3 text-white"
                required
              />
            </div>
          )}

          {paymentMode === 'NFT_TICKET' && (
            <>
              <div>
                <label htmlFor="nftTicketPrice" className="mb-2 block font-semibold text-sm">
                  NFTチケット価格 (XRP)
                </label>
                <input
                  id="nftTicketPrice"
                  type="number"
                  value={nftTicketPrice}
                  onChange={(e) => setNftTicketPrice(Number(e.target.value))}
                  min="0"
                  step="0.1"
                  className="w-full rounded-lg bg-white/10 px-4 py-3 text-white"
                  required
                />
              </div>

              <div>
                <label htmlFor="nftImage" className="mb-2 block font-semibold text-sm">
                  NFTチケット画像 *
                </label>
                <input
                  id="nftImage"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full rounded-lg bg-white/10 px-4 py-3 text-white file:mr-4 file:rounded-full file:border-0 file:bg-white/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-white/30"
                  required
                />
                {imagePreview && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm text-gray-400">プレビュー:</p>
                    <img
                      src={imagePreview}
                      alt="NFT ticket preview"
                      className="h-40 w-40 rounded-lg object-cover"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={createRoomMutation.isPending}
              className="rounded-full bg-blue-600 px-8 py-3 font-semibold transition hover:bg-blue-700 disabled:opacity-50"
            >
              {createRoomMutation.isPending ? '作成中...' : 'ルームを作成'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/rooms')}
              className="rounded-full bg-white/10 px-8 py-3 font-semibold transition hover:bg-white/20"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>

      {/* NFTokenMinter認可モーダル */}
      {showMinterAuth && minterSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg bg-white/10 p-8 backdrop-blur-sm">
            <h2 className="mb-4 text-center font-bold text-xl text-white">
              NFTokenMinter認可が必要です
            </h2>
            
            <div className="mb-6 space-y-4 text-sm">
              <p className="text-gray-300">
                NFTチケットモードを使用するには、あなたのアカウントで署名ウォレットをNFTokenMinterとして認可する必要があります。
              </p>
              
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-gray-400">あなたのアドレス:</p>
                <p className="font-mono text-xs text-white">{minterSettings.userAddress}</p>
              </div>
              
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-gray-400">署名ウォレット:</p>
                <p className="font-mono text-xs text-white">{minterSettings.minterAddress}</p>
              </div>
              
              <div className="rounded-lg bg-orange-600/20 p-3">
                <p className="text-gray-400">現在の認可状態:</p>
                <p className="font-mono text-xs text-white">{minterSettings.isAuthorized ? '認可済み' : '未認可'}</p>
              </div>
              
              <p className="text-yellow-400 text-xs">
                ⚠️ この設定により、署名ウォレットがあなたの代わりにNFTを発行できるようになります。
              </p>
            </div>

            {/* QRコード表示 */}
            {minterAuthQrUrl && (
              <div className="mb-6 rounded-lg bg-white p-4">
                <p className="mb-2 text-center text-gray-700 text-sm">
                  Xamanアプリでスキャンしてください
                </p>
                <div className="flex justify-center">
                  <img
                    src={minterAuthQrUrl}
                    alt="NFTokenMinter Authorization QR Code"
                    className="h-48 w-48"
                  />
                </div>
                <p className="mt-2 text-center text-gray-500 text-xs">
                  AccountSetトランザクションに署名してください
                </p>
              </div>
            )}
            
            <div className="flex gap-4">
              {!minterAuthQrUrl && (
                <button
                  onClick={handleAuthorizeMinter}
                  disabled={isAuthorizingMinter}
                  className="flex-1 rounded-full bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {isAuthorizingMinter ? '処理中...' : 'Xamanで認可'}
                </button>
              )}
              
              <button
                onClick={() => {
                  setShowMinterAuth(false);
                  setMinterAuthQrUrl(null);
                  setIsAuthorizingMinter(false);
                }}
                disabled={isAuthorizingMinter && !!minterAuthQrUrl}
                className={`${minterAuthQrUrl ? 'w-full' : 'flex-1'} rounded-full bg-white/10 py-3 font-semibold text-white transition hover:bg-white/20 disabled:opacity-50`}
              >
                {minterAuthQrUrl ? '認可を待っています...' : 'キャンセル'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}