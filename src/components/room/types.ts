import type { ParticipantWithAllFields } from '~/lib/types';

export interface RoomData {
	id: string;
	title: string;
	description?: string | null;
	status: 'WAITING' | 'LIVE' | 'ENDED';
	xrpPerMinute: number;
	creatorId: string;
	agoraChannelName: string;
	paymentMode: 'PAYMENT_CHANNEL' | 'NFT_TICKET';
	nftTicketPrice?: number | null;
	nftTicketImageUrl?: string | null;
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
	lastAmount?: string | null; // drops
	balance: string; // drops
	status: 'OPEN' | 'CLOSING' | 'CLOSED';
	senderId: string;
	receiverId: string;
	roomId: string;
	publicKey: string;
	lastSignature?: string | null;
	settleDelay: number;
	createdAt: Date;
	updatedAt: Date;
	closedAt?: Date | null;
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
	myChannel?: PaymentChannelData;
	room?: RoomData;
	isBalanceInsufficient?: boolean;
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
	roomStatus: 'WAITING' | 'LIVE' | 'ENDED';
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
