/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import './src/env.js';

/** @type {import("next").NextConfig} */
const config = {
	images: {
		remotePatterns: [
			{
				protocol: 'https',
				hostname: 'xumm.app',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: 'www.gravatar.com',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: '*.ipfs.nftstorage.link',
				pathname: '/**',
			},
			{
				protocol: 'https',
				hostname: 'ipfs.io',
				pathname: '/**',
			},
		],
	},
};

export default config;
