import { authRouter } from '~/server/api/routers/auth';
import { nftRouter } from '~/server/api/routers/nft';
import { paymentChannelRouter } from '~/server/api/routers/paymentChannel';
import { roomRouter } from '~/server/api/routers/room';
import { userRouter } from '~/server/api/routers/user';
import { xummRouter } from '~/server/api/routers/xumm';
import { createCallerFactory, createTRPCRouter } from '~/server/api/trpc';

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
	auth: authRouter,
	room: roomRouter,
	paymentChannel: paymentChannelRouter,
	user: userRouter,
	nft: nftRouter,
	xumm: xummRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
