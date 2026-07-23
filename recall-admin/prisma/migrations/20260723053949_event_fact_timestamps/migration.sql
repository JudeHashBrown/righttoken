-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "anomalyChangedAt" TIMESTAMP(3),
ADD COLUMN     "checkoutChangedAt" TIMESTAMP(3),
ADD COLUMN     "profileChangedAt" TIMESTAMP(3);
