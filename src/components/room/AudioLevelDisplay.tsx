import { AudioLevelIndicator } from '~/components/AudioLevelIndicator';
import type { ParticipantWithAllFields } from '~/lib/types';

interface AudioLevelDisplayProps {
	isPublished: boolean;
	localAudioLevel: number;
	isMuted: boolean;
	remoteAudioLevels: Map<string | number, number> | null;
	participants: ParticipantWithAllFields[];
}

export function AudioLevelDisplay({
	isPublished,
	localAudioLevel,
	isMuted,
	remoteAudioLevels,
	participants,
}: AudioLevelDisplayProps) {
	return (
		<>
			{/* Local Audio Level */}
			{isPublished && (
				<div className="mt-4">
					<AudioLevelIndicator level={localAudioLevel} label="自分の音声" isMuted={isMuted} />
				</div>
			)}

			{/* Remote Audio Levels */}
			{remoteAudioLevels && remoteAudioLevels.size > 0 && (
				<div className="mt-4 space-y-2">
					<p className="font-semibold text-gray-300 text-xs">接続中のユーザー音声レベル:</p>
					{Array.from(remoteAudioLevels.entries())
						.filter(([uid, level]) => {
							// Find the participant by matching the uid
							const remoteParticipant = participants.find((p) => {
								// Generate uid from userId
								let userUid = 0;
								for (let i = 0; i < p.userId.length; i++) {
									const hash = (userUid << 5) - userUid + p.userId.charCodeAt(i);
									userUid = hash & hash;
								}
								userUid = Math.abs(userUid) % 1000000;
								return userUid === Number(uid);
							});

							// Only show audio levels for:
							// 1. Participants who are still in the room (leftAt is null)
							// 2. Participants who have speaking permissions (HOST or canSpeak)
							if (!remoteParticipant || remoteParticipant.leftAt !== null) {
								return false;
							}

							// Check if participant has speaking permissions
							const canSpeak = remoteParticipant.role === 'HOST' || 
								('canSpeak' in remoteParticipant && remoteParticipant.canSpeak === true);
							
							return canSpeak;
						})
						.map(([uid, level]) => {
							// Find the participant again for the label
							const remoteParticipant = participants.find((p) => {
								// Generate uid from userId
								let userUid = 0;
								for (let i = 0; i < p.userId.length; i++) {
									const hash = (userUid << 5) - userUid + p.userId.charCodeAt(i);
									userUid = hash & hash;
								}
								userUid = Math.abs(userUid) % 1000000;
								return userUid === Number(uid);
							});

							const label = remoteParticipant
								? remoteParticipant.user.nickname ||
									remoteParticipant.user.walletAddress.slice(0, 8) + '...'
								: `User ${uid}`;

							return <AudioLevelIndicator key={uid} level={level} label={label} />;
						})}
				</div>
			)}
		</>
	);
}
