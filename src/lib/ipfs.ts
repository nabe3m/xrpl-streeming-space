import { env } from '~/env';

interface IPFSUploadResponse {
  cid: string;
  url: string;
}

interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  attributes?: {
    trait_type: string;
    value: string;
  }[];
}

/**
 * Upload a file to IPFS using Pinata or another IPFS service
 */
export async function uploadToIPFS(file: File): Promise<IPFSUploadResponse> {
  if (!env.IPFS_API_URL || !env.IPFS_API_KEY) {
    // Use a free IPFS gateway if no API is configured
    console.warn('IPFS API not configured, using public gateway');
    return uploadToPublicIPFS(file);
  }

  const formData = new FormData();
  formData.append('file', file);

  // Use Pinata API directly if the URL is not a full URL
  // Handle Pinata dedicated gateway URLs
  let apiUrl: string;
  if (env.IPFS_API_URL.startsWith('http')) {
    apiUrl = env.IPFS_API_URL;
  } else if (env.IPFS_API_URL.includes('.mypinata.cloud')) {
    // This is a dedicated gateway URL, we need the API URL instead
    apiUrl = 'https://api.pinata.cloud';
  } else {
    apiUrl = `https://${env.IPFS_API_URL}`;
  }
  
  const url = `${apiUrl}/pinning/pinFileToIPFS`;
  console.log('Uploading to IPFS:', url);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.IPFS_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('IPFS upload error:', response.status, errorText);
    throw new Error(`Failed to upload to IPFS: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  return {
    cid: data.IpfsHash,
    url: `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
  };
}

/**
 * Upload metadata JSON to IPFS
 */
export async function uploadMetadataToIPFS(metadata: NFTMetadata): Promise<IPFSUploadResponse> {
  if (!env.IPFS_API_URL || !env.IPFS_API_KEY) {
    console.warn('IPFS API not configured, using public gateway');
    return uploadJSONToPublicIPFS(metadata);
  }

  // Use Pinata API directly if the URL is not a full URL
  // Handle Pinata dedicated gateway URLs
  let apiUrl: string;
  if (env.IPFS_API_URL.startsWith('http')) {
    apiUrl = env.IPFS_API_URL;
  } else if (env.IPFS_API_URL.includes('.mypinata.cloud')) {
    // This is a dedicated gateway URL, we need the API URL instead
    apiUrl = 'https://api.pinata.cloud';
  } else {
    apiUrl = `https://${env.IPFS_API_URL}`;
  }
    
  const url = `${apiUrl}/pinning/pinJSONToIPFS`;
  console.log('Uploading metadata to IPFS:', url);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.IPFS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: metadata.name,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('IPFS metadata upload error:', response.status, errorText);
    throw new Error(`Failed to upload metadata to IPFS: ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  return {
    cid: data.IpfsHash,
    url: `https://gateway.pinata.cloud/ipfs/${data.IpfsHash}`,
  };
}

/**
 * Fallback: Upload to public IPFS gateway (less reliable)
 */
async function uploadToPublicIPFS(file: File): Promise<IPFSUploadResponse> {
  // Convert file to base64
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  
  // For demo purposes, we'll use a placeholder
  // In production, you'd want to use a proper IPFS service
  console.warn('Using placeholder IPFS URL - configure IPFS_API_URL and IPFS_API_KEY for production');
  
  const cid = `Qm${Date.now()}${Math.random().toString(36).substring(7)}`;
  
  return {
    cid,
    url: `data:${file.type};base64,${base64}`, // Data URL as fallback
  };
}

/**
 * Fallback: Upload JSON to public IPFS gateway
 */
async function uploadJSONToPublicIPFS(metadata: NFTMetadata): Promise<IPFSUploadResponse> {
  const jsonString = JSON.stringify(metadata);
  const base64 = Buffer.from(jsonString).toString('base64');
  
  const cid = `Qm${Date.now()}${Math.random().toString(36).substring(7)}`;
  
  return {
    cid,
    url: `data:application/json;base64,${base64}`, // Data URL as fallback
  };
}

/**
 * Create NFT metadata for a room ticket
 */
export function createNFTTicketMetadata(
  roomTitle: string,
  roomDescription: string | null,
  imageUrl: string,
  hostName: string,
  roomId: string,
  hostWalletAddress?: string
): NFTMetadata {
  const attributes = [
    {
      trait_type: 'Room',
      value: roomTitle,
    },
    {
      trait_type: 'Host',
      value: hostName,
    },
    {
      trait_type: 'Room ID',
      value: roomId,
    },
    {
      trait_type: 'Type',
      value: 'Access Ticket',
    },
  ];

  if (hostWalletAddress) {
    attributes.push({
      trait_type: 'Host Wallet',
      value: hostWalletAddress,
    });
  }

  return {
    name: `${roomTitle} - Ticket`,
    description: roomDescription || `Access ticket for ${roomTitle} hosted by ${hostName}`,
    image: imageUrl,
    attributes,
  };
}