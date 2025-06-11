import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		DATABASE_URL: z.string().url(),
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
		XRPL_NETWORK: z.string().url(),
		XRPL_SIGNATURE_SECRET: z.string(),
		XRPL_SIGNATURE_ADDRESS: z.string().optional(),
		XUMM_API_KEY: z.string(),
		XUMM_API_SECRET: z.string(),
		AGORA_APP_ID: z.string(),
		AGORA_APP_CERTIFICATE: z.string(),
		NEXTAUTH_SECRET: process.env.NODE_ENV === 'production' ? z.string() : z.string().optional(),
		NEXTAUTH_URL: z.preprocess(
			(str) => process.env.VERCEL_URL ?? str,
			process.env.VERCEL ? z.string() : z.string().url(),
		),
		IPFS_API_URL: z.string().url().optional(),
		IPFS_API_KEY: z.string().optional(),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		NEXT_PUBLIC_XRPL_NETWORK: z.string().url(),
		NEXT_PUBLIC_AGORA_APP_ID: z.string(),
		NEXT_PUBLIC_XUMM_API_KEY: z.string(),
	},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,
		XRPL_NETWORK: process.env.XRPL_NETWORK,
		XRPL_SIGNATURE_SECRET: process.env.XRPL_SIGNATURE_SECRET,
		XRPL_SIGNATURE_ADDRESS: process.env.XRPL_SIGNATURE_ADDRESS,
		XUMM_API_KEY: process.env.XUMM_API_KEY,
		XUMM_API_SECRET: process.env.XUMM_API_SECRET,
		AGORA_APP_ID: process.env.AGORA_APP_ID,
		AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
		NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
		NEXTAUTH_URL: process.env.NEXTAUTH_URL,
		IPFS_API_URL: process.env.IPFS_API_URL,
		IPFS_API_KEY: process.env.IPFS_API_KEY,
		NEXT_PUBLIC_XRPL_NETWORK: process.env.NEXT_PUBLIC_XRPL_NETWORK,
		NEXT_PUBLIC_AGORA_APP_ID: process.env.NEXT_PUBLIC_AGORA_APP_ID,
		NEXT_PUBLIC_XUMM_API_KEY: process.env.NEXT_PUBLIC_XUMM_API_KEY,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
