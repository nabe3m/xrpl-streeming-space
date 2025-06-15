import {
  NFTokenMintFlags,
  convertStringToHex,
} from 'xrpl';
import type {
  NFTokenMint,
  NFTokenCreateOffer,
  NFTokenAcceptOffer,
} from 'xrpl';
import { getXRPLClient, getSignatureWallet } from './xrpl';

export interface NFTMintParams {
  uri: string;
  taxon: number;
  transferFee?: number; // 0-50000 (0-50%)
}

export interface NFTOfferParams {
  tokenId: string;
  amount: string; // Amount in drops
  destination: string;
  issuer?: string; // Optional issuer field for future use
}

/**
 * Mint an NFT with the signature wallet
 * Based on: https://zenn.dev/nabe3/articles/07f4e81ee83657
 */
export async function mintNFT(params: {
  uri: string;
  taxon: number;
  transferFee?: number;
  issuer?: string; // Optional issuer field for future use
  destination?: string; // Optional destination address for direct transfer
  amount?: string; // Optional amount in drops for payment with NFT transfer
}): Promise<{
  tokenId: string;
  transactionHash: string;
  offerId?: string; // Offer ID if Destination and Amount were used
}> {
  console.log('mintNFT called with params:', params);
  
  const client = await getXRPLClient();
  console.log('XRPL client connected:', client.isConnected());
  
  const minterWallet = await getSignatureWallet();
  console.log('Minter wallet address:', minterWallet.address);

  const mintTx: NFTokenMint = {
    TransactionType: 'NFTokenMint',
    Account: minterWallet.address,
    URI: convertStringToHex(params.uri),
    NFTokenTaxon: params.taxon,
    Flags: NFTokenMintFlags.tfTransferable, // tfTransferable
    TransferFee: params.transferFee || 0,
  };

  // Add Issuer field if provided (requires NFTokenMinter authorization)
  if (params.issuer && params.issuer !== minterWallet.address) {
    (mintTx as any).Issuer = params.issuer;
    console.log('Minting NFT with Issuer field:', params.issuer);
  }

  // Add Destination and Amount fields if provided (direct transfer to recipient with payment)
  // When using Destination, Amount is required
  if (params.destination) {
    (mintTx as any).Destination = params.destination;
    // Use the provided amount or default to 0 drops
    (mintTx as any).Amount = params.amount || "0";
    console.log('Minting NFT with Destination field:', params.destination);
    console.log('Amount (in drops):', params.amount || "0");
  }

  const prepared = await client.autofill(mintTx);
  const signed = minterWallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  console.log('NFT Mint Transaction Hash:', result.result.hash);
  console.log('NFT Mint Validated:', result.result.validated);
  
  // Check transaction result
  const transactionResult = (result.result.meta as any)?.TransactionResult;
  console.log('Transaction Result:', transactionResult);

  if (!result.result.validated || transactionResult !== 'tesSUCCESS') {
    console.log('Full Transaction Result:', JSON.stringify(result.result, null, 2));
    
    if (transactionResult === 'tecNO_PERMISSION') {
      throw new Error(`NFT Mint failed: No permission. The issuer account has not authorized this minter wallet as their NFTokenMinter.`);
    }
    throw new Error(`NFT Mint failed with result: ${transactionResult}`);
  }

  if (result.result.meta && typeof result.result.meta !== 'string') {
    const meta = result.result.meta;
    console.log('Transaction Meta:', JSON.stringify(meta, null, 2));
    
    let tokenId: string | undefined;
    let offerId: string | undefined;
    
    // Get NFT ID and Offer ID from CreatedNodes
    const createdNodes = (meta as any).CreatedNodes;
    if (createdNodes) {
      for (const node of createdNodes) {
        if (node.CreatedNode?.LedgerEntryType === 'NFTokenPage') {
          // Extract NFT ID from the NFTokenPage
          const nfts = node.CreatedNode.NewFields?.NFTokens || node.CreatedNode.FinalFields?.NFTokens;
          if (nfts && nfts.length > 0) {
            const latestNFT = nfts[nfts.length - 1];
            tokenId = latestNFT.NFToken.NFTokenID;
          }
        } else if (node.CreatedNode?.LedgerEntryType === 'NFTokenOffer') {
          // Extract Offer ID when Destination and Amount are used
          offerId = node.CreatedNode.LedgerIndex || node.CreatedNode.index;
          console.log('Found NFTokenOffer in CreatedNodes:', offerId);
        }
      }
    }
    
    // Check ModifiedNodes for NFTokenPage updates if not found in CreatedNodes
    if (!tokenId) {
      const modifiedNodes = (meta as any).ModifiedNodes;
      if (modifiedNodes) {
        console.log('Checking ModifiedNodes...');
        for (const node of modifiedNodes) {
          if (node.ModifiedNode?.LedgerEntryType === 'NFTokenPage') {
            console.log('Found modified NFTokenPage');
            // Get the new NFTs from FinalFields
            const finalNFTs = node.ModifiedNode.FinalFields?.NFTokens;
            const previousNFTs = node.ModifiedNode.PreviousFields?.NFTokens || [];
            
            if (finalNFTs && finalNFTs.length > previousNFTs.length) {
              // Find the newly added NFT
              const newNFT = finalNFTs.find((nft: any) => 
                !previousNFTs.some((prev: any) => 
                  prev.NFToken.NFTokenID === nft.NFToken.NFTokenID
                )
              );
              
              if (newNFT) {
                console.log('Found new NFT in ModifiedNode:', newNFT.NFToken.NFTokenID);
                tokenId = newNFT.NFToken.NFTokenID;
              }
            }
          }
        }
      }
    }
    
    // Fallback: check nftoken_id in meta
    if (!tokenId) {
      const nftokenId = (meta as any).nftoken_id;
      if (nftokenId) {
        tokenId = nftokenId;
      }
    }
    
    // Check for offer_id at the meta level (when using Destination and Amount)
    if (!offerId && (meta as any).offer_id) {
      offerId = (meta as any).offer_id;
      console.log('Found offer_id at meta level:', offerId);
    }
    
    if (tokenId) {
      const mintResult = {
        tokenId,
        transactionHash: result.result.hash,
        ...(offerId && { offerId }),
      };
      console.log('Mint result:', mintResult);
      return mintResult;
    }
  }

  throw new Error('Failed to get NFT token ID from transaction');
}

/**
 * Create a sell offer for an NFT
 */
export async function createNFTSellOffer(params: NFTOfferParams): Promise<{
  offerId: string;
  transactionHash: string;
}> {
  const client = await getXRPLClient();
  const wallet = await getSignatureWallet();

  const offerTx: NFTokenCreateOffer = {
    TransactionType: 'NFTokenCreateOffer',
    Account: params.issuer || wallet.address,
    NFTokenID: params.tokenId,
    Amount: params.amount,
    Destination: params.destination,
    Flags: 1, // tfSellNFToken
  };

  const prepared = await client.autofill(offerTx);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  // Log for debugging
  console.log('NFT Sell Offer Transaction Hash:', result.result.hash);
  console.log('NFT Sell Offer Validated:', result.result.validated);

  // Check if transaction was successful
  if (!result.result.validated) {
    throw new Error(`Transaction failed: ${JSON.stringify(result.result)}`);
  }

  if (result.result.meta && typeof result.result.meta !== 'string') {
    const meta = result.result.meta;
    
    // Log the full meta for debugging
    console.log('Transaction Meta:', JSON.stringify(meta, null, 2));
    
    // Check CreatedNodes
    const createdNodes = (meta as any).CreatedNodes;
    if (createdNodes && Array.isArray(createdNodes)) {
      console.log(`Found ${createdNodes.length} CreatedNodes`);
      
      for (const node of createdNodes) {
        console.log('Node type:', node.CreatedNode?.LedgerEntryType);
        
        if (node.CreatedNode?.LedgerEntryType === 'NFTokenOffer') {
          const offerId = node.CreatedNode.LedgerIndex || node.CreatedNode.index;
          console.log('Found NFTokenOffer with ID:', offerId);
          
          return {
            offerId: offerId,
            transactionHash: result.result.hash,
          };
        }
      }
    }

    // Check AffectedNodes as alternative
    const affectedNodes = (meta as any).AffectedNodes;
    if (affectedNodes && Array.isArray(affectedNodes)) {
      console.log(`Checking ${affectedNodes.length} AffectedNodes`);
      
      for (const node of affectedNodes) {
        if (node.CreatedNode?.LedgerEntryType === 'NFTokenOffer') {
          const offerId = node.CreatedNode.LedgerIndex || node.CreatedNode.index;
          console.log('Found NFTokenOffer in AffectedNodes with ID:', offerId);
          
          return {
            offerId: offerId,
            transactionHash: result.result.hash,
          };
        }
      }
    }

    // Alternative method: check for offer_id in meta
    const offerId = (meta as any).offer_id || (meta as any).nftoken_offer;
    if (offerId) {
      console.log('Found offer ID in meta:', offerId);
      return {
        offerId: offerId,
        transactionHash: result.result.hash,
      };
    }
  }

  // Log full result for debugging
  console.error('Failed to find offer ID. Full result:', JSON.stringify(result, null, 2));
  throw new Error('Failed to get offer ID from transaction');
}

/**
 * Get NFT offer to be accepted by the buyer
 */
export async function getNFTAcceptOfferTransaction(offerId: string, buyerAddress: string) {
  const acceptTx: NFTokenAcceptOffer = {
    TransactionType: 'NFTokenAcceptOffer',
    Account: buyerAddress,
    NFTokenSellOffer: offerId,
  };

  return acceptTx;
}

/**
 * Check if a wallet owns a specific NFT
 */
export async function checkNFTOwnership(
  walletAddress: string,
  tokenId: string
): Promise<boolean> {
  const client = await getXRPLClient();

  try {
    const response = await client.request({
      command: 'account_nfts',
      account: walletAddress,
    });

    const nfts = response.result.account_nfts;
    return nfts.some((nft: any) => nft.NFTokenID === tokenId);
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    return false;
  }
}

/**
 * Check if wallet owns any NFT from a specific issuer with a specific taxon
 */
export async function checkNFTOwnershipByIssuerAndTaxon(
  walletAddress: string,
  issuerAddress: string,
  taxon: number
): Promise<{ owns: boolean; tokenId?: string }> {
  console.log('Checking NFT ownership:', {
    walletAddress,
    issuerAddress,
    taxon
  });
  
  const client = await getXRPLClient();

  try {
    const response = await client.request({
      command: 'account_nfts',
      account: walletAddress,
    });

    const nfts = response.result.account_nfts;
    console.log(`Found ${nfts.length} NFTs for wallet ${walletAddress}`);
    
    // Debug: 最初の数個のNFTを表示
    if (nfts.length > 0) {
      console.log('Sample NFTs:', nfts.slice(0, 3).map((nft: any) => ({
        TokenID: nft.NFTokenID,
        Issuer: nft.Issuer,
        Taxon: nft.NFTokenTaxon,
      })));
    }
    
    const matchingNFT = nfts.find((nft: any) => {
      // Log each NFT check for debugging
      if (nft.NFTokenTaxon === taxon) {
        console.log(`NFT with matching taxon found:`, {
          TokenID: nft.NFTokenID,
          Issuer: nft.Issuer,
          expectedIssuer: issuerAddress,
          taxon: nft.NFTokenTaxon,
          matches: nft.Issuer === issuerAddress
        });
      }
      
      const matches = nft.Issuer === issuerAddress && nft.NFTokenTaxon === taxon;
      return matches;
    });

    if (matchingNFT) {
      console.log('Matching NFT found:', {
        TokenID: matchingNFT.NFTokenID,
        Issuer: matchingNFT.Issuer,
        Taxon: matchingNFT.NFTokenTaxon,
      });
    } else {
      console.log('No matching NFT found');
    }

    return {
      owns: !!matchingNFT,
      tokenId: matchingNFT?.NFTokenID,
    };
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    return { owns: false };
  }
}


/**
 * Generate a unique taxon for a room
 * Uses room ID hash to ensure uniqueness
 */
export function generateTaxonForRoom(roomId: string): number {
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) {
    const char = roomId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Ensure positive number and within valid range
  return Math.abs(hash) % 2147483648; // Max uint32
}

/**
 * Check if an account has authorized a specific NFTokenMinter
 */
export async function checkNFTokenMinter(
  accountAddress: string,
  expectedMinterAddress: string
): Promise<boolean> {
  const client = await getXRPLClient();

  try {
    // 最新のレジャーを使用（validatedだと古い可能性がある）
    const response = await client.request({
      command: 'account_info',
      account: accountAddress,
      ledger_index: 'current',  // 最新のレジャーを使用
    });

    const accountData = response.result.account_data;
    
    // デバッグ: AccountDataの全体を確認
    console.log('Full AccountData:', {
      account: accountAddress,
      flags: accountData.Flags,
      accountDataKeys: Object.keys(accountData),
    });
    
    // NFTokenMinterフィールドを確認
    const nftokenMinter = accountData.NFTokenMinter;
    
    console.log('Account NFTokenMinter check:', {
      account: accountAddress,
      currentMinter: nftokenMinter,
      expectedMinter: expectedMinterAddress,
      matches: nftokenMinter === expectedMinterAddress,
      ledgerIndex: response.result.ledger_current_index,
      validated: response.result.validated,
      accountDataHasNFTokenMinter: 'NFTokenMinter' in accountData,
    });

    return nftokenMinter === expectedMinterAddress;
  } catch (error) {
    console.error('Error checking NFTokenMinter:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    return false;
  }
}

/**
 * Create AccountSet transaction to authorize NFTokenMinter
 */
export function createNFTokenMinterTransaction(
  accountAddress: string,
  minterAddress: string
) {
  // NFTokenMinterフィールドを設定し、対応するフラグもセットする
  return {
    TransactionType: 'AccountSet' as const,
    Account: accountAddress,
    NFTokenMinter: minterAddress,
    SetFlag: 10, // AccountSetAsfFlags.asfAuthorizedNFTokenMinter
  };
}

/**
 * Create AccountSet transaction to clear NFTokenMinter
 */
export function clearNFTokenMinterTransaction(
  accountAddress: string
) {
  return {
    TransactionType: 'AccountSet' as const,
    Account: accountAddress,
    ClearFlag: 10, // asfAuthorizedNFTokenMinter
  };
}

/**
 * Check NFTokenMinter using raw request (alternative method)
 */
export async function checkNFTokenMinterRaw(
  accountAddress: string
): Promise<string | undefined> {
  const client = await getXRPLClient();

  try {
    const response = await client.request({
      command: 'account_info',
      account: accountAddress,
      ledger_index: 'validated',
    });

    const accountData = response.result.account_data;
    console.log('Raw account_info response:', JSON.stringify(accountData, null, 2));
    
    return (accountData as any).NFTokenMinter;
  } catch (error) {
    console.error('Error in checkNFTokenMinterRaw:', error);
    return undefined;
  }
}

/**
 * Wait for a transaction to be validated on the XRPL
 * @param txHash - The transaction hash to verify
 * @param maxAttempts - Maximum number of attempts (default: 10)
 * @param delayMs - Delay between attempts in milliseconds (default: 2000)
 * @returns true if validated, false if failed or timed out
 */
export async function waitForTransactionValidation(
  txHash: string,
  maxAttempts: number = 10,
  delayMs: number = 2000
): Promise<boolean> {
  const client = await getXRPLClient();
  
  console.log(`Waiting for transaction ${txHash} to be validated...`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.request({
        command: 'tx',
        transaction: txHash,
      });
      
      console.log(`Attempt ${attempt}: Transaction status:`, response.result.validated);
      
      if (response.result.validated === true) {
        const transactionResult = (response.result.meta as any)?.TransactionResult;
        console.log('Transaction validated successfully:', {
          hash: txHash,
          result: transactionResult,
          attempts: attempt,
        });
        
        // Check if transaction was successful
        if (transactionResult && transactionResult !== 'tesSUCCESS') {
          console.error('Transaction failed with result:', transactionResult);
          return false;
        }
        
        return true;
      }
    } catch (error: any) {
      // If transaction not found, it might not be in the ledger yet
      if (error.data?.error === 'txnNotFound') {
        console.log(`Attempt ${attempt}: Transaction not found yet, waiting...`);
      } else {
        console.error(`Attempt ${attempt}: Error checking transaction:`, error);
      }
    }
    
    // Wait before next attempt
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  console.error(`Transaction ${txHash} was not validated after ${maxAttempts} attempts`);
  return false;
}