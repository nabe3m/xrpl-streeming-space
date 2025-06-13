import { useEffect, useState } from 'react';

interface SpeakPermissionNotificationProps {
  wasRevoked: boolean;
  onClose: () => void;
}

export function SpeakPermissionNotification({ wasRevoked, onClose }: SpeakPermissionNotificationProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (wasRevoked) {
      setShow(true);
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setShow(false);
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [wasRevoked, onClose]);

  if (!show) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
      <div className="rounded-lg bg-red-600 px-6 py-4 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
          <div>
            <p className="font-semibold">発言権が取り消されました</p>
            <p className="text-sm opacity-90">ホストにより音声配信が停止されました</p>
          </div>
          <button
            onClick={() => {
              setShow(false);
              onClose();
            }}
            className="ml-4 hover:opacity-80"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}