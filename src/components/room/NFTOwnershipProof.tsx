'use client';

import { env } from '~/env';

interface NFTDetails {
  tokenId: string;
  issuer: string;
  taxon: number;
  ownerWallet: string;
  roomTitle: string;
}

interface NFTOwnershipProofProps {
  nftDetails: NFTDetails;
}

export function NFTOwnershipProof({ nftDetails }: NFTOwnershipProofProps) {
  const isTestnet = env.NEXT_PUBLIC_XRPL_NETWORK?.includes('testnet');
  const explorerBaseUrl = isTestnet 
    ? 'https://testnet.xrpl.org' 
    : 'https://livenet.xrpl.org';

  // Generate URLs for explorer
  const nftUrl = `${explorerBaseUrl}/nft/${nftDetails.tokenId}`;
  const ownerUrl = `${explorerBaseUrl}/accounts/${nftDetails.ownerWallet}`;

  return (
    <div className="rounded-lg bg-green-900/20 border border-green-600/30 p-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="font-medium text-green-300 text-sm">NFTチケット所有確認済み</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 flex-shrink-0">ルーム:</span>
          <span className="text-white font-medium truncate">{nftDetails.roomTitle}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400 flex-shrink-0">NFT ID:</span>
          <a
            href={nftUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 font-mono truncate flex items-center gap-1"
          >
            {nftDetails.tokenId.slice(0, 8)}...{nftDetails.tokenId.slice(-4)}
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400 flex-shrink-0">所有者:</span>
          <a
            href={ownerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 font-mono truncate flex items-center gap-1"
          >
            {nftDetails.ownerWallet.slice(0, 6)}...{nftDetails.ownerWallet.slice(-4)}
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400 flex-shrink-0">Taxon:</span>
          <span className="text-white font-mono">{nftDetails.taxon}</span>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1">
        <svg className="w-3 h-3 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-green-300">
          XRP Ledger上で検証可能
        </p>
      </div>
    </div>
  );
}