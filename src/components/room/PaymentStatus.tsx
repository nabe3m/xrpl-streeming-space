import { dropsToXrp } from "xrpl";
import type { PaymentStatusProps } from "./types";

export function PaymentStatus({
  myChannel,
  incomingChannels,
  room,
  isHost,
  totalPaidSeconds,
}: PaymentStatusProps) {
  if (isHost && incomingChannels) {
    return (
      <div className="mb-6 rounded-lg bg-white/5 p-4">
        <h3 className="mb-4 font-semibold">受信した支払い</h3>
        {incomingChannels.length > 0 ? (
          <div className="space-y-3">
            {incomingChannels.map((channel) => (
              <div key={channel.id} className="rounded bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">
                    {channel.sender.nickname ||
                      channel.sender.walletAddress.slice(0, 8)}
                    ...
                  </span>
                  <span className="font-semibold text-green-400">
                    {dropsToXrp(channel.lastAmount || "0")} XRP
                  </span>
                </div>
              </div>
            ))}
            <div className="border-t border-white/10 pt-2">
              <div className="flex justify-between font-semibold">
                <span>合計受信額:</span>
                <span className="text-green-400">
                  {incomingChannels
                    .reduce(
                      (sum, channel) =>
                        sum + Number(dropsToXrp(channel.lastAmount || "0")),
                      0,
                    )
                    .toFixed(6)}{" "}
                  XRP
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">まだ支払いがありません</p>
        )}
      </div>
    );
  }

  if (!isHost && myChannel) {
    return (
      <div className="mb-6 rounded-lg bg-white/5 p-4">
        <h3 className="mb-4 font-semibold">支払い状況</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">チャネル残高:</span>
            <span>
              {dropsToXrp(
                BigInt(myChannel.amount) - BigInt(myChannel.lastAmount || "0"),
              )}{" "}
              XRP
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">使用済み:</span>
            <span>{dropsToXrp(myChannel.lastAmount || "0")} XRP</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">視聴時間:</span>
            <span>{Math.floor(totalPaidSeconds / 60)}分</span>
          </div>
        </div>
      </div>
    );
  }

  return null;
} 