import React from 'react';

interface AudioLevelIndicatorProps {
	level: number; // 0-100
	label: string;
	isMuted?: boolean;
}

export function AudioLevelIndicator({ level, label, isMuted = false }: AudioLevelIndicatorProps) {
	// 音声レベルを5段階のバーで表示
	const bars = 5;
	const activeBarCount = Math.ceil((level / 100) * bars);

	return (
		<div className="flex items-center gap-2">
			<span className="w-20 text-gray-400 text-xs">{label}</span>
			<div className="flex h-4 items-end gap-1">
				{Array.from({ length: bars }).map((_, i) => {
					const isActive = i < activeBarCount && !isMuted;
					const height = `${20 + i * 20}%`; // 20%, 40%, 60%, 80%, 100%

					return (
						<div
							key={i}
							className={`w-1 transition-all duration-100 ${
								isActive ? 'bg-green-400' : isMuted ? 'bg-red-600 opacity-30' : 'bg-gray-600'
							}`}
							style={{ height }}
						/>
					);
				})}
			</div>
			{isMuted && <span className="ml-2 text-red-400 text-xs">ミュート中</span>}
		</div>
	);
}
