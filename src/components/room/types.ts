import type { ParticipantWithAllFields } from "~/lib/types";

export interface RoomData {
  id: string;
  title: string;
  description?: string | null;
  status: "WAITING" | "LIVE" | "ENDED";
  xrpPerMinute: number;
  creatorId: string;
  agoraChannelName: string;
  creator: {
    nickname?: string | null;
    walletAddress: string;
  };
  participants: ParticipantWithAllFields[];
}

export interface PaymentChannelData {
  id: string;
  channelId: string;
  amount: string; // drops
  lastAmount?: string; // drops
  sender: {
    nickname?: string;
    walletAddress: string;
  };
  updatedAt?: Date;
}

export interface RoomPageProps {
  roomId: string;
  userId: string | null;
  room: RoomData | null;
  isHost: boolean;
  participant?: ParticipantWithAllFields;
  myChannel?: PaymentChannelData;
  incomingChannels?: PaymentChannelData[];
}

export interface AudioControlsProps {
  canSpeak: boolean;
  isPublished: boolean;
  isMuted: boolean;
  connectionState: string;
  shouldBeHost: boolean;
  participant?: ParticipantWithAllFields;
  roomId: string;
  onPublishAudio: () => Promise<void>;
  onToggleMute: () => void;
  onRequestSpeak: () => void;
  onLeaveRoom: () => void;
}

export interface PaymentChannelManagerProps {
  room: RoomData;
  userId: string;
  isHost: boolean;
  myChannel?: PaymentChannelData;
  isCreatingChannel: boolean;
  isAddingDeposit: boolean;
  channelAmountXRP: number;
  depositAmountXRP: number;
  xummQrCode: string | null;
  xummQrUrl: string | null;
  onCreateChannel: () => void;
  onAddDeposit: () => void;
  onCancel: () => void;
  onChannelAmountChange: (amount: number) => void;
  onDepositAmountChange: (amount: number) => void;
}

export interface ParticipantsListProps {
  participants: ParticipantWithAllFields[];
  isHost: boolean;
  roomId: string;
  onGrantSpeak: (participantId: string) => void;
  onRevokeSpeak: (participantId: string) => void;
}

export interface HostControlsProps {
  roomStatus: "WAITING" | "LIVE" | "ENDED";
  roomId: string;
  onStartRoom: () => void;
  onEndRoom: () => void;
}

export interface PaymentStatusProps {
  myChannel?: PaymentChannelData;
  incomingChannels?: PaymentChannelData[];
  room: RoomData;
  isHost: boolean;
  totalPaidSeconds: number;
  paymentChannelId: string | null;
  isAddingDeposit: boolean;
  depositAmountXRP: number;
  onAddDeposit: () => void;
  onDepositAmountChange: (amount: number) => void;
}

export interface RoomInfoProps {
  room: RoomData;
  participantCount: number;
}

export interface JoinRoomButtonProps {
  room: RoomData;
  userId: string | null;
  isHost: boolean;
  myChannel?: PaymentChannelData;
  isJoining: boolean;
  isLoadingChannel: boolean;
  isAddingDeposit: boolean;
  depositAmountXRP: number;
  onJoinRoom: () => void;
  onAddDeposit: () => void;
  onDepositAmountChange: (amount: number) => void;
} 