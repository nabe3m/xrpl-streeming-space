-- AlterTable
ALTER TABLE "User" ADD COLUMN "nftokenMinter" TEXT;
ALTER TABLE "User" ADD COLUMN "nftokenMinterSetAt" DATETIME;

-- CreateTable
CREATE TABLE "NFTTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "mintTxHash" TEXT,
    "acceptTxHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NFTTicket_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NFTTicket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "creatorId" TEXT NOT NULL,
    "agoraChannelName" TEXT NOT NULL,
    "xrpPerMinute" REAL NOT NULL DEFAULT 0.01,
    "nftTokenId" TEXT,
    "nftCollectionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "paymentMode" TEXT NOT NULL DEFAULT 'PAYMENT_CHANNEL',
    "nftTicketPrice" REAL,
    "nftTicketImageUrl" TEXT,
    "nftTicketMetadataUri" TEXT,
    "nftTicketTaxon" INTEGER,
    CONSTRAINT "Room_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Room" ("agoraChannelName", "createdAt", "creatorId", "description", "endedAt", "id", "nftCollectionId", "nftTokenId", "startedAt", "status", "title", "updatedAt", "xrpPerMinute") SELECT "agoraChannelName", "createdAt", "creatorId", "description", "endedAt", "id", "nftCollectionId", "nftTokenId", "startedAt", "status", "title", "updatedAt", "xrpPerMinute" FROM "Room";
DROP TABLE "Room";
ALTER TABLE "new_Room" RENAME TO "Room";
CREATE UNIQUE INDEX "Room_agoraChannelName_key" ON "Room"("agoraChannelName");
CREATE INDEX "Room_creatorId_idx" ON "Room"("creatorId");
CREATE INDEX "Room_status_idx" ON "Room"("status");
CREATE INDEX "Room_paymentMode_idx" ON "Room"("paymentMode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "NFTTicket_tokenId_key" ON "NFTTicket"("tokenId");

-- CreateIndex
CREATE INDEX "NFTTicket_roomId_idx" ON "NFTTicket"("roomId");

-- CreateIndex
CREATE INDEX "NFTTicket_ownerId_idx" ON "NFTTicket"("ownerId");

-- CreateIndex
CREATE INDEX "NFTTicket_tokenId_idx" ON "NFTTicket"("tokenId");

-- CreateIndex
CREATE INDEX "NFTTicket_status_idx" ON "NFTTicket"("status");
