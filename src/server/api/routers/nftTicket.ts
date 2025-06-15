import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { 
  mintNFT, 
  createNFTSellOffer, 
  getNFTAcceptOfferTransaction,
  checkNFTOwnershipByIssuerAndTaxon,
  generateTaxonForRoom,
} from '~/lib/xrpl-nft';
import { createTransactionPayload } from '~/lib/xumm';
import { xrpToDrops } from 'xrpl';
import { createTRPCRouter, protectedProcedure } from '~/server/api/trpc';

export const nFTTicketRouter = createTRPCRouter({
  // Purchase NFT ticket for a room
  purchaseTicket: protectedProcedure
    .input(
      z.object({
        roomId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log('=== purchaseTicket mutation started ===');
      console.log('Input:', input);
      console.log('User ID:', ctx.session.userId);
      
      // Get room details
      const room = await ctx.db.room.findUnique({
        where: { id: input.roomId },
        include: { creator: true },
      });

      console.log('Room found:', room ? 'Yes' : 'No');
      
      if (!room) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Room not found',
        });
      }

      console.log('Room payment mode:', room.paymentMode);
      
      if (room.paymentMode !== 'NFT_TICKET') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This room does not use NFT tickets',
        });
      }

      console.log('NFT ticket config:', {
        metadataUri: room.nftTicketMetadataUri,
        price: room.nftTicketPrice,
        taxon: room.nftTicketTaxon
      });

      if (!room.nftTicketMetadataUri || !room.nftTicketPrice || !room.nftTicketTaxon) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'NFT ticket not properly configured for this room',
        });
      }

      // Check if user already owns a ticket
      const existingTicket = await ctx.db.nFTTicket.findFirst({
        where: {
          roomId: input.roomId,
          ownerId: ctx.session.userId,
          status: 'ACCEPTED',
        },
      });

      if (existingTicket) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You already own a ticket for this room',
        });
      }

      // Generate a temporary unique ID for the ticket
      // This will be replaced with the actual NFT token ID after minting
      const tempTokenId = `pending_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Create pending ticket record
      const ticket = await ctx.db.nFTTicket.create({
        data: {
          roomId: input.roomId,
          ownerId: ctx.session.userId,
          issuerId: room.creator.walletAddress,
          price: room.nftTicketPrice,
          status: 'PENDING',
          tokenId: tempTokenId, // Temporary unique ID, will be updated after minting
        },
      });

      // Get user details
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.userId },
      });

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      try {
        console.log('Starting NFT minting process with direct transfer...');
        
        // Mint NFT with Destination and Amount to create automatic sell offer
        // This requires NFTokenMinter authorization from the room host
        // The Amount field creates an automatic sell offer to the Destination
        const mintResult = await mintNFT({
          uri: room.nftTicketMetadataUri,
          taxon: room.nftTicketTaxon,
          transferFee: 1000, // 1% royalty
          issuer: room.creator.walletAddress, // Host's address as issuer
          destination: user.walletAddress, // Direct transfer to buyer
          amount: xrpToDrops(room.nftTicketPrice), // This creates a sell offer at this price
        });
        
        console.log('NFT minted with sell offer:', mintResult);

        // Update ticket with mint info
        await ctx.db.nFTTicket.update({
          where: { id: ticket.id },
          data: {
            tokenId: mintResult.tokenId,
            mintTxHash: mintResult.transactionHash,
            status: 'OFFER_CREATED', // Offer is created, waiting for acceptance
          },
        });

        // The NFT has been minted with an automatic sell offer
        // Now the user needs to accept this offer by paying the specified amount
        
        if (!mintResult.offerId) {
          // If no offer ID was returned, something went wrong
          throw new Error('No sell offer was created with the NFT mint');
        }

        // Create NFTokenAcceptOffer transaction for the user to sign
        const acceptOfferTx = await getNFTAcceptOfferTransaction(
          mintResult.offerId,
          user.walletAddress
        );

        console.log('NFTokenAcceptOffer transaction created:', acceptOfferTx);

        const payload = await createTransactionPayload(acceptOfferTx);

        console.log('Xumm payload created:', payload);

        return {
          ticketId: ticket.id,
          tokenId: mintResult.tokenId,
          offerId: mintResult.offerId,
          payload,
        };
      } catch (error) {
        // Update ticket status to failed
        await ctx.db.nFTTicket.update({
          where: { id: ticket.id },
          data: { status: 'FAILED' },
        });

        console.error('Failed to create NFT ticket:', error);
        
        // Provide more specific error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create NFT ticket: ${errorMessage}`,
        });
      }
    }),

  // Confirm ticket purchase after user accepts the NFT offer
  confirmPurchase: protectedProcedure
    .input(
      z.object({
        ticketId: z.string(),
        transactionHash: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const ticket = await ctx.db.nFTTicket.findUnique({
        where: { id: input.ticketId },
        include: {
          room: true,
        },
      });

      if (!ticket) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Ticket not found',
        });
      }

      if (ticket.ownerId !== ctx.session.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not your ticket',
        });
      }

      // Import the validation function
      const { waitForTransactionValidation } = await import('~/lib/xrpl-nft');
      
      console.log('Verifying NFTokenAcceptOffer transaction:', input.transactionHash);
      
      // Wait for transaction to be validated on XRPL
      const isValidated = await waitForTransactionValidation(input.transactionHash, 15, 2000);
      
      if (!isValidated) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Transaction not validated on XRPL. Please try again.',
        });
      }

      // Update ticket status to ACCEPTED after NFTokenAcceptOffer transaction is validated
      await ctx.db.nFTTicket.update({
        where: { id: input.ticketId },
        data: {
          acceptTxHash: input.transactionHash, // NFTokenAcceptOffer transaction hash
          status: 'ACCEPTED', // Mark as accepted
        },
      });
      
      // Force a check to verify ownership on blockchain
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.userId },
      });
      
      if (user && ticket.room) {
        console.log('Performing immediate ownership verification after purchase...');
        const { checkNFTOwnershipByIssuerAndTaxon } = await import('~/lib/xrpl-nft');
        
        // Get room creator's wallet address
        const roomCreator = await ctx.db.user.findUnique({
          where: { id: ticket.room.creatorId },
        });
        
        if (roomCreator) {
          // Check with room creator as issuer
          const ownership = await checkNFTOwnershipByIssuerAndTaxon(
            user.walletAddress,
            roomCreator.walletAddress,  // Room creator's wallet as issuer
            ticket.room.nftTicketTaxon || 0
          );
          
          console.log('Post-purchase ownership check with room creator as issuer:', ownership);
        }
      }

      return { success: true };
    }),

  // Check if user has access to a room
  checkAccess: protectedProcedure
    .input(
      z.object({
        roomId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const room = await ctx.db.room.findUnique({
        where: { id: input.roomId },
        include: { creator: true },
      });

      if (!room) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Room not found',
        });
      }

      // If not NFT ticket mode, always allow access
      if (room.paymentMode !== 'NFT_TICKET') {
        return { hasAccess: true };
      }

      // Host always has access
      if (room.creatorId === ctx.session.userId) {
        return { hasAccess: true };
      }

      // Check if user owns an NFT ticket
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.userId },
      });

      if (!user) {
        return { hasAccess: false };
      }

      console.log('Checking access for room:', {
        roomId: input.roomId,
        roomTitle: room.title,
        nftTicketTaxon: room.nftTicketTaxon,
        userWallet: user.walletAddress,
        hostWallet: room.creator.walletAddress,
      });

      // Get signature wallet address for NFT issuer check
      const { getSignatureWallet } = await import('~/lib/xrpl');
      const signatureWallet = await getSignatureWallet();
      
      console.log('Signature wallet address:', signatureWallet.address);
      
      // Check on-chain ownership
      // NFTはホストがIssuerとして発行される（NFTokenMinter権限により）
      const ownership = await checkNFTOwnershipByIssuerAndTaxon(
        user.walletAddress,
        room.creator.walletAddress,  // NFTのIssuer（ホスト）
        room.nftTicketTaxon || 0
      );

      console.log('On-chain ownership result:', ownership);
      
      // If not found with host as issuer, also check with minter wallet as issuer
      // (in case the NFT was minted differently)
      if (!ownership.owns) {
        console.log('Checking with minter wallet as issuer...');
        const ownershipWithMinter = await checkNFTOwnershipByIssuerAndTaxon(
          user.walletAddress,
          signatureWallet.address,  // Minter wallet as issuer
          room.nftTicketTaxon || 0
        );
        console.log('Ownership check with minter wallet:', ownershipWithMinter);
        
        if (ownershipWithMinter.owns) {
          return {
            hasAccess: true,
            tokenId: ownershipWithMinter.tokenId,
          };
        }
      }

      // Also check database for accepted tickets
      const dbTicket = await ctx.db.nFTTicket.findFirst({
        where: {
          roomId: input.roomId,
          ownerId: ctx.session.userId,
          status: 'ACCEPTED',
        },
      });

      console.log('Database ticket found:', !!dbTicket);

      const hasAccess = ownership.owns || !!dbTicket;
      console.log('Final access result:', hasAccess);

      // Get additional NFT details if owned
      let nftDetails = null;
      const tokenId = ownership.tokenId || dbTicket?.tokenId;
      if (hasAccess && tokenId) {
        nftDetails = {
          tokenId: tokenId,
          issuer: ownership.owns ? room.creator.walletAddress : signatureWallet.address,
          taxon: room.nftTicketTaxon || 0,
          ownerWallet: user.walletAddress,
          roomTitle: room.title,
        };
      }

      return {
        hasAccess,
        tokenId: ownership.tokenId || dbTicket?.tokenId,
        nftDetails,
      };
    }),

  // Get user's tickets
  getMyTickets: protectedProcedure.query(async ({ ctx }) => {
    const tickets = await ctx.db.nFTTicket.findMany({
      where: {
        ownerId: ctx.session.userId,
        status: 'ACCEPTED',
      },
      include: {
        room: {
          include: {
            creator: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return tickets;
  }),

  // Get tickets sold for a room (for hosts)
  getRoomTickets: protectedProcedure
    .input(
      z.object({
        roomId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const room = await ctx.db.room.findUnique({
        where: { id: input.roomId },
      });

      if (!room || room.creatorId !== ctx.session.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized',
        });
      }

      const tickets = await ctx.db.nFTTicket.findMany({
        where: {
          roomId: input.roomId,
          status: 'ACCEPTED',
        },
        include: {
          owner: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return tickets;
    }),
});