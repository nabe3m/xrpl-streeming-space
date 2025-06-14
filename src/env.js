import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		DATABASE_PROVIDER: z.enum(['sqlite', 'postgresql']),
		DATABASE_URL: z.string().refine((val) => {
			// Allow file:// URLs for SQLite or proper URLs for PostgreSQL
			return val.startsWith('file:') || val.startsWith('postgres://') || val.startsWith('postgresql://');
		}, 'DATABASE_URL must be a valid SQLite file path or PostgreSQL URL'),
		NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
		XRPL_NETWORK: z.string().url(),
		XRPL_SIGNATURE_SECRET: z.string(),
		XRPL_SIGNATURE_ADDRESS: z.string().optional(),
		XUMM_API_KEY: z.string(),
		XUMM_API_SECRET: z.string(),
		AGORA_APP_ID: z.string(),
		AGORA_APP_CERTIFICATE: z.string(),
		IPFS_API_URL: z.string().optional(),
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
		DATABASE_PROVIDER: process.env.DATABASE_PROVIDER,
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,
		XRPL_NETWORK: process.env.XRPL_NETWORK,
		XRPL_SIGNATURE_SECRET: process.env.XRPL_SIGNATURE_SECRET,
		XRPL_SIGNATURE_ADDRESS: process.env.XRPL_SIGNATURE_ADDRESS,
		XUMM_API_KEY: process.env.XUMM_API_KEY,
		XUMM_API_SECRET: process.env.XUMM_API_SECRET,
		AGORA_APP_ID: process.env.AGORA_APP_ID,
		AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE,
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
