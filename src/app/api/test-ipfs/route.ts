import { NextResponse } from 'next/server';
import { uploadToIPFS, uploadMetadataToIPFS } from '~/lib/ipfs';

export async function GET() {
  try {
    // Test file upload
    console.log('Testing IPFS file upload...');
    const testContent = 'Hello IPFS test';
    const testBlob = new Blob([testContent], { type: 'text/plain' });
    const testFile = new File([testBlob], 'test.txt', { type: 'text/plain' });
    
    const fileResult = await uploadToIPFS(testFile);
    console.log('File upload result:', fileResult);
    
    // Test metadata upload
    console.log('\nTesting IPFS metadata upload...');
    const testMetadata = {
      name: 'Test NFT',
      description: 'Test description',
      image: 'https://example.com/image.png',
      attributes: []
    };
    
    const metadataResult = await uploadMetadataToIPFS(testMetadata);
    console.log('Metadata upload result:', metadataResult);
    
    return NextResponse.json({
      success: true,
      fileUpload: fileResult,
      metadataUpload: metadataResult
    });
    
  } catch (error) {
    console.error('IPFS test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}