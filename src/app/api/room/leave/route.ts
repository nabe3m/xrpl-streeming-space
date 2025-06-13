import { type NextRequest, NextResponse } from 'next/server';
import { db } from '~/server/db';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { roomId, userId } = body;

		if (!roomId || !userId) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
		}

		// 参加者を検索
		const participant = await db.roomParticipant.findUnique({
			where: {
				roomId_userId: {
					roomId,
					userId,
				},
			},
		});

		if (!participant) {
			return NextResponse.json({ error: 'Participant not found' }, { status: 404 });
		}

		// 退室処理
		const now = new Date();
		const timeInRoom = Math.floor((now.getTime() - participant.joinedAt.getTime()) / 1000);

		await db.roomParticipant.update({
			where: { id: participant.id },
			data: {
				leftAt: now,
				totalTimeSeconds: participant.totalTimeSeconds + timeInRoom,
			},
		});

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error in leave room API:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
