-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RoomParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'LISTENER',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "totalTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "totalPaidXrp" REAL NOT NULL DEFAULT 0,
    "canSpeak" BOOLEAN NOT NULL DEFAULT false,
    "speakRequestedAt" DATETIME,
    CONSTRAINT "RoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RoomParticipant" ("id", "joinedAt", "leftAt", "role", "roomId", "totalPaidXrp", "totalTimeSeconds", "userId") SELECT "id", "joinedAt", "leftAt", "role", "roomId", "totalPaidXrp", "totalTimeSeconds", "userId" FROM "RoomParticipant";
DROP TABLE "RoomParticipant";
ALTER TABLE "new_RoomParticipant" RENAME TO "RoomParticipant";
CREATE INDEX "RoomParticipant_roomId_idx" ON "RoomParticipant"("roomId");
CREATE INDEX "RoomParticipant_userId_idx" ON "RoomParticipant"("userId");
CREATE UNIQUE INDEX "RoomParticipant_roomId_userId_key" ON "RoomParticipant"("roomId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
