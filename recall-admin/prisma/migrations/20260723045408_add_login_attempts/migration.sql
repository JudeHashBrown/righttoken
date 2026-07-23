-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_emailHash_ipHash_createdAt_idx" ON "LoginAttempt"("emailHash", "ipHash", "createdAt");
