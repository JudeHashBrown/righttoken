-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "secondFactorRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "secondFactorVerifiedAt" TIMESTAMP(3);
