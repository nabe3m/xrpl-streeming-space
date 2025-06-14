'use client';

import { useState, useEffect } from 'react';
import { api } from '~/trpc/react';
import { subscribeToPayload } from '~/lib/xumm';

interface NFTTicketPurchaseProps {
  roomId: string;
  roomTitle: string;
  ticketPrice: number;
  ticketImageUrl?: string;
  onPurchaseComplete: () => void;
}

export function NFTTicketPurchase({
  roomId,
  roomTitle,
  ticketPrice,
  ticketImageUrl,
  onPurchaseComplete,
}: NFTTicketPurchaseProps) {
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const purchaseTicketMutation = api.nftTicket.purchaseTicket.useMutation();
  const confirmPurchaseMutation = api.nftTicket.confirmPurchase.useMutation();

  useEffect(() => {
    // モバイルデバイスかどうかを検出
    const checkMobile = () => {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handlePurchase = async () => {
    if (isPurchasing) return;

    setIsPurchasing(true);
    setStatusMessage('NFTチケットを発行中...');

    try {
      const result = await purchaseTicketMutation.mutateAsync({ roomId });
      
      console.log('Purchase ticket result:', result);

      setStatusMessage('NFTチケットが発行されました！購入を完了してください...');

      if (result.payload?.qrUrl) {
        console.log('QR URL received:', result.payload.qrUrl);
        
        if (isMobile) {
          // モバイルの場合は新しいタブで開く
          window.open(result.payload.qrUrl, '_blank');
        } else {
          // PCの場合はQRコードを画面内に表示
          setQrUrl(result.payload.qrUrl);
        }
        
        // ディープリンクがある場合はモバイルで使用
        if (isMobile && result.payload.deeplink) {
          window.location.href = result.payload.deeplink;
        }
      } else {
        console.error('No QR URL in response. Full payload:', result.payload);
        console.error('Full result:', result);
        
        // デバッグ: payloadの構造を確認
        if (result.payload) {
          console.error('Payload keys:', Object.keys(result.payload));
        }
      }

      if (result.payload.uuid) {
        await subscribeToPayload(
          result.payload.uuid,
          async (data) => {
            if (data.signed === true) {
              setStatusMessage('購入を処理中...');
              
              try {
                await confirmPurchaseMutation.mutateAsync({
                  ticketId: result.ticketId,
                  transactionHash: data.txid,
                });

                setStatusMessage('NFTチケットの購入が完了しました！');
                // Immediately notify parent to refetch access
                onPurchaseComplete();
                // Also show success for a bit before UI changes
                setTimeout(() => {
                  setStatusMessage('');
                }, 2000);
              } catch (error) {
                console.error('Failed to confirm purchase:', error);
                setStatusMessage('購入の処理に失敗しました');
                setIsPurchasing(false);
                setQrUrl(null);
              }
            } else if (data.signed === false) {
              setStatusMessage('購入がキャンセルされました');
              setIsPurchasing(false);
              setQrUrl(null);
            }
          }
        );

        // Store cleanup function if component unmounts
        // Note: You may want to add proper cleanup in a useEffect if needed
      }
    } catch (error) {
      console.error('Failed to purchase ticket:', error);
      setStatusMessage('NFTチケットの作成に失敗しました');
      setIsPurchasing(false);
      setQrUrl(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#1a1b3a] to-[#0f0f23] p-4">
      <div className="w-full max-w-md rounded-lg bg-white/10 p-8 backdrop-blur-sm">
        <h2 className="mb-6 text-center font-bold text-2xl text-white">
          NFTチケットを購入
        </h2>

        <div className="mb-6 space-y-4">
          <div className="text-center">
            <h3 className="font-semibold text-lg text-white">{roomTitle}</h3>
            <p className="mt-2 text-gray-300">入場にはNFTチケットが必要です</p>
          </div>

          {ticketImageUrl && (
            <div className="flex justify-center">
              <img
                src={ticketImageUrl}
                alt="NFT ticket"
                className="h-48 w-48 rounded-lg object-cover"
              />
            </div>
          )}

          <div className="rounded-lg bg-white/5 p-4">
            <p className="text-center text-gray-300 text-sm">チケット価格</p>
            <p className="text-center font-bold text-2xl text-white">
              {ticketPrice} XRP
            </p>
          </div>

          <div className="space-y-2 text-sm text-gray-300">
            <p>✓ 一度購入すれば何度でも入場可能</p>
            <p>✓ NFTはあなたのウォレットに保管</p>
            <p>✓ 転送・売却も可能</p>
          </div>
        </div>

        {statusMessage && (
          <div className="mb-4 rounded-lg bg-blue-600/20 p-3 text-center text-sm text-blue-200">
            {statusMessage}
          </div>
        )}

        {/* QRコード表示（PC用） */}
        {qrUrl && !isMobile && (
          <div className="mb-4 rounded-lg bg-white p-4">
            <p className="mb-2 text-center text-gray-700 text-sm">
              NFTチケットが発行されました！購入を完了するにはXamanアプリでスキャンしてください
            </p>
            <div className="flex justify-center">
              <img
                src={qrUrl}
                alt="Xumm QR Code"
                className="h-64 w-64"
              />
            </div>
            <p className="mt-2 text-center text-gray-500 text-xs">
              スマートフォンのXamanアプリでこのQRコードをスキャンしてください
            </p>
          </div>
        )}

        {!qrUrl && (
          <button
            onClick={handlePurchase}
            disabled={isPurchasing}
            className="w-full rounded-full bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {isPurchasing ? '処理中...' : `${ticketPrice} XRPで購入`}
          </button>
        )}

        <p className="mt-4 text-center text-gray-400 text-xs">
          購入にはXamanウォレットが必要です
        </p>
      </div>
    </div>
  );
}