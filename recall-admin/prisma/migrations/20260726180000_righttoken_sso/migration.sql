ALTER TABLE "Member"
ADD COLUMN "rightTokenUserId" TEXT;

CREATE UNIQUE INDEX "Member_rightTokenUserId_key"
ON "Member"("rightTokenUserId");

CREATE TABLE "SsoTicketRedemption" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoTicketRedemption_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "SsoTicketRedemption_expiresAt_idx"
ON "SsoTicketRedemption"("expiresAt");
