// 共通型定義

/**
 * Prismaスキーマの全フィールドを含む参加者の型定義
 * room参加者を表すための完全な型情報を含む
 */
export interface ParticipantWithAllFields {
  id: string;
  roomId: string;
  userId: string;
  role: "HOST" | "LISTENER";
  joinedAt: Date;
  leftAt: Date | null;
  totalTimeSeconds: number;
  totalPaidXrp: number;
  canSpeak: boolean;
  speakRequestedAt: Date | null;
  user: {
    id: string;
    walletAddress: string;
    nickname: string | null;
    avatarUrl: string | null;
    emailHash: string | null;
    twitterHandle: string | null;
    facebookHandle: string | null;
    instagramHandle: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
} 