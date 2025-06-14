interface PaymentChannelCreationProps {
	isCreatingChannel: boolean;
	channelAmountXRP: number;
	xummQrCode: string | null;
	xummQrUrl: string | null;
	room:
		| {
				xrpPerMinute: number | null;
		  }
		| null
		| undefined;
	onAmountChange: (amount: number) => void;
	onCreateChannel: () => void;
	onCancel: () => void;
}

export function PaymentChannelCreation({
	isCreatingChannel,
	channelAmountXRP,
	xummQrCode,
	xummQrUrl,
	room,
	onAmountChange,
	onCreateChannel,
	onCancel,
}: PaymentChannelCreationProps) {
	if (!isCreatingChannel) return null;

	if (channelAmountXRP > 0 && !xummQrCode) {
		return (
			<div className="text-center">
				<p className="mb-4 text-gray-300">支払いチャネルの作成</p>
				<div className="mx-auto mb-6 max-w-sm">
					<label className="mb-2 block text-gray-400 text-sm">チャネルに預ける金額 (XRP)</label>
					<div className="flex items-center gap-2">
						<input
							type="number"
							value={channelAmountXRP}
							onChange={(e) =>
								onAmountChange(Math.max(0.1, Number.parseFloat(e.target.value) || 0))
							}
							min="0.0000001"
							step="0.000001"
							className="flex-1 rounded bg-white/10 px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						<span className="text-gray-400">XRP</span>
					</div>
					<p className="mt-2 text-gray-500 text-xs">
						推奨: {Math.ceil(channelAmountXRP / (room?.xrpPerMinute || 0.01))}
						分間の視聴が可能
					</p>
					<p className="mt-1 text-gray-500 text-xs">料金: {room?.xrpPerMinute} XRP/分</p>
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
			</div>
		);
	}

	if (xummQrCode) {
		return (
			<div className="text-center">
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
						target="__blank"
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
			</div>
		);
	}

	return (
		<div className="text-center">
			<p className="text-gray-400 text-sm">Xamanウォレットでトランザクションを準備中...</p>
		</div>
	);
}
