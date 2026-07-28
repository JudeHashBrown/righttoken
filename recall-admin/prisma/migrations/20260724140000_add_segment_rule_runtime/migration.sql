ALTER TABLE "UserProfile"
  ADD COLUMN "balanceCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "balanceUsdMinor" INTEGER NOT NULL DEFAULT 0;

UPDATE "UserProfile"
SET "balanceUsdMinor" = "balanceMinor";
