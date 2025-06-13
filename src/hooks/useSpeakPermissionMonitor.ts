import { useEffect, useRef, useState } from 'react';
import type { ParticipantWithAllFields } from '~/lib/types';

interface UseSpeakPermissionMonitorProps {
  participant: ParticipantWithAllFields | undefined;
  isHost: boolean;
  isPublished: boolean;
  unpublishAudio: () => Promise<void>;
  userId: string | null;
}

export function useSpeakPermissionMonitor({
  participant,
  isHost,
  isPublished,
  unpublishAudio,
  userId,
}: UseSpeakPermissionMonitorProps) {
  const prevCanSpeakRef = useRef<boolean | undefined>(undefined);
  const [wasRevoked, setWasRevoked] = useState(false);

  useEffect(() => {
    if (!participant || !userId || isHost) {
      return;
    }

    const currentCanSpeak = participant.canSpeak;
    const prevCanSpeak = prevCanSpeakRef.current;

    // Store the current value for next comparison
    prevCanSpeakRef.current = currentCanSpeak;

    // Check if speak permission was revoked (was true, now false)
    if (prevCanSpeak === true && currentCanSpeak === false) {
      console.log('🚨 Speak permission revoked - stopping audio publication');
      
      // Set revoked flag for notification
      setWasRevoked(true);
      
      // Unpublish audio immediately if published
      if (isPublished) {
        unpublishAudio()
          .then(() => {
            console.log('✅ Audio unpublished successfully after permission revocation');
          })
          .catch((error) => {
            console.error('❌ Failed to unpublish audio after permission revocation:', error);
          });
      }
    }
  }, [participant?.canSpeak, isHost, isPublished, unpublishAudio, userId]);

  const clearRevoked = () => setWasRevoked(false);

  return { wasRevoked, clearRevoked };
}