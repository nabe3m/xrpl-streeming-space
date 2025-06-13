import { dropsToXrp } from 'xrpl';
import type { PaymentChannelManagerProps } from './types';

export function PaymentChannelManager({
	room,
	userId,
	isHost,
	myChannel,
	isCreatingChannel,
	isAddingDeposit,
	channelAmountXRP,
	depositAmountXRP,
	xummQrCode,
	xummQrUrl,
	onCreateChannel,
	onAddDeposit,
	onCancel,
	onChannelAmountChange,
	onDepositAmountChange,
}: PaymentChannelManagerProps) {
	if (isAddingDeposit) {
		return (
			<div className="text-center">
				<p className="mb-4 font-semibold text-gray-300 text-lg">🔄 デポジットを追加</p>
				<div className="mb-4 rounded-lg bg-blue-900/30 p-3">
					<p className="mb-2 text-blue-300 text-sm">現在の状態:</p>
					<pre className="text-blue-100 text-xs">
						{JSON.stringify(
							{
								isAddingDeposit,
								depositAmountXRP,
								xummQrCode: !!xummQrCode,
								myChannel: myChannel
									? {
											channelId: myChannel.channelId.slice(0, 8) + '...',
											amount: dropsToXrp(myChannel.amount),
											lastAmount: myChannel.lastAmount ? dropsToXrp(myChannel.lastAmount) : '0',
										}
									: null,
							},
							null,
							2,
						)}
					</pre>
				</div>
				{!xummQrCode ? (
					<>
						<div className="mx-auto mb-6 max-w-sm">
							<label className="mb-2 block text-gray-400 text-sm">追加する金額 (XRP)</label>
							<div className="flex items-center gap-2">
								<input
									type="number"
									value={depositAmountXRP}
									onChange={(e) =>
										onDepositAmountChange(Math.max(0.1, Number.parseFloat(e.target.value) || 0))
									}
									min="0.000060"
									step="0.1"
									className="flex-1 rounded bg-white/10 px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
								<span className="text-gray-400">XRP</span>
							</div>
							<p className="mt-2 text-gray-500 text-xs">
								追加後:{' '}
								{Math.ceil(
									(depositAmountXRP +
										(myChannel
											? Number(
													dropsToXrp(
														BigInt(myChannel.amount) - BigInt(myChannel.lastAmount || '0'),
													),
												)
											: 0)) /
										(room.xrpPerMinute || 0.01),
								)}
								分間の視聴が可能
							</p>
						</div>
						<div className="flex justify-center gap-2">
							<button
								type="button"
								onClick={() => {
									console.log('🚀 Add deposit button clicked', { depositAmountXRP, myChannel });
									onAddDeposit();
								}}
								disabled={depositAmountXRP <= 0}
								className="rounded-full bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700 disabled:opacity-50"
							>
								追加する
							</button>
							<button
								type="button"
								onClick={() => {
									console.log('🚀 Cancel deposit button clicked');
									onCancel();
								}}
								className="rounded-full bg-gray-600 px-6 py-2 transition hover:bg-gray-700"
							>
								キャンセル
							</button>
						</div>
					</>
				) : (
					<>
						<p className="mb-4 text-gray-300">{depositAmountXRP} XRPを追加中...</p>
						<div className="mb-4">
							<img
								src={xummQrCode}
								alt="Xumm QR Code"
								className="mx-auto rounded-lg"
								style={{ maxWidth: '300px' }}
							/>
						</div>
						<p className="mb-2 text-gray-400 text-sm">
							XamanウォレットでこのQRコードをスキャンしてください
						</p>
						{xummQrUrl && (
							<a
								href={xummQrUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-400 text-sm underline hover:text-blue-300"
							>
								モバイルで開く
							</a>
						)}
						<div className="mt-4">
							<button
								type="button"
								onClick={() => {
									console.log('🚀 Cancel QR button clicked');
									onCancel();
								}}
								className="rounded bg-gray-600 px-6 py-2 text-sm transition hover:bg-gray-700"
							>
								キャンセル
							</button>
						</div>
					</>
				)}
			</div>
		);
	}

	if (isCreatingChannel) {
		return (
			<div className="text-center">
				{channelAmountXRP > 0 && !xummQrCode ? (
					<>
						<p className="mb-4 text-gray-300">支払いチャネルの作成</p>
						<div className="mx-auto mb-6 max-w-sm">
							<label className="mb-2 block text-gray-400 text-sm">チャネルに預ける金額 (XRP)</label>
							<div className="flex items-center gap-2">
								<input
									type="number"
									value={channelAmountXRP}
									onChange={(e) =>
										onChannelAmountChange(Math.max(0.1, Number.parseFloat(e.target.value) || 0))
									}
									min="0.1"
									step="1"
									className="flex-1 rounded bg-white/10 px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
								/>
								<span className="text-gray-400">XRP</span>
							</div>
							<p className="mt-2 text-gray-500 text-xs">
								推奨: {Math.ceil(channelAmountXRP / room.xrpPerMinute)}
								分間の視聴が可能
							</p>
							<p className="mt-1 text-gray-500 text-xs">料金: {room.xrpPerMinute} XRP/分</p>
						</div>
						<div className="flex justify-center gap-2">
							<button
								type="button"
								onClick={onCreateChannel}
								className="rounded-full bg-blue-600 px-6 py-2 font-semibold transition hover:bg-blue-700"
							>
								チャネルを作成
							</button>
							<button
								type="button"
								onClick={onCancel}
								className="rounded-full bg-gray-600 px-6 py-2 transition hover:bg-gray-700"
							>
								キャンセル
							</button>
						</div>
					</>
				) : xummQrCode ? (
					<>
						<p className="mb-4 text-gray-300">{channelAmountXRP} XRPの支払いチャネルを作成中...</p>
						<div className="mb-4">
							<img
								src={xummQrCode}
								alt="Xumm QR Code"
								className="mx-auto rounded-lg"
								style={{ maxWidth: '300px' }}
							/>
						</div>
						<p className="mb-2 text-gray-400 text-sm">
							XamanウォレットでこのQRコードをスキャンしてください
						</p>
						{xummQrUrl && (
							<a
								href={xummQrUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-400 text-sm underline hover:text-blue-300"
							>
								モバイルで開く
							</a>
						)}
						<div className="mt-4">
							<button
								type="button"
								onClick={onCancel}
								className="rounded bg-gray-600 px-6 py-2 text-sm transition hover:bg-gray-700"
							>
								キャンセル
							</button>
						</div>
					</>
				) : (
					<p className="text-gray-400 text-sm">Xamanウォレットでトランザクションを準備中...</p>
				)}
			</div>
		);
	}

	return null;
}
