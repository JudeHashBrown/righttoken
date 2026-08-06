CREATE TYPE "recall"."MailPurpose"
  AS ENUM ('PAYMENT_FOLLOW_UP', 'KNOWLEDGE_SHARE', 'PRODUCT_UPDATE', 'CAMPAIGN', 'OTHER');

CREATE TYPE "recall"."MaintenanceSource"
  AS ENUM ('MANUAL', 'MAIL');

CREATE TYPE "recall"."CouponGrantStatus"
  AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "recall"."MailMessage"
  ADD COLUMN "purpose" "recall"."MailPurpose" NOT NULL DEFAULT 'OTHER';

ALTER TABLE "recall"."MailBatch"
  ADD COLUMN "purpose" "recall"."MailPurpose" NOT NULL DEFAULT 'OTHER';

CREATE TABLE "recall"."UserContact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "wechatId" TEXT,
  "telegramHandle" TEXT,
  "phoneCountryCode" TEXT,
  "phoneNumber" TEXT,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recall"."UserMaintenanceRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" "recall"."MaintenanceSource" NOT NULL,
  "sourceMessageId" TEXT,
  "actorId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMaintenanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recall"."CouponGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "recall"."CouponGrantStatus" NOT NULL DEFAULT 'PENDING',
  "externalCouponId" TEXT,
  "failureCode" TEXT,
  "grantedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CouponGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserContact_userId_key"
  ON "recall"."UserContact"("userId");

CREATE UNIQUE INDEX "UserMaintenanceRecord_sourceMessageId_key"
  ON "recall"."UserMaintenanceRecord"("sourceMessageId");

CREATE INDEX "UserMaintenanceRecord_userId_occurredAt_idx"
  ON "recall"."UserMaintenanceRecord"("userId", "occurredAt");

CREATE UNIQUE INDEX "CouponGrant_userId_key"
  ON "recall"."CouponGrant"("userId");

CREATE UNIQUE INDEX "CouponGrant_idempotencyKey_key"
  ON "recall"."CouponGrant"("idempotencyKey");

ALTER TABLE "recall"."UserContact"
  ADD CONSTRAINT "UserContact_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "recall"."UserProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recall"."UserContact"
  ADD CONSTRAINT "UserContact_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "recall"."Member"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recall"."UserMaintenanceRecord"
  ADD CONSTRAINT "UserMaintenanceRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "recall"."UserProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recall"."UserMaintenanceRecord"
  ADD CONSTRAINT "UserMaintenanceRecord_sourceMessageId_fkey"
  FOREIGN KEY ("sourceMessageId") REFERENCES "recall"."MailMessage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recall"."UserMaintenanceRecord"
  ADD CONSTRAINT "UserMaintenanceRecord_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "recall"."Member"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recall"."CouponGrant"
  ADD CONSTRAINT "CouponGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "recall"."UserProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recall"."CouponGrant"
  ADD CONSTRAINT "CouponGrant_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "recall"."Member"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
