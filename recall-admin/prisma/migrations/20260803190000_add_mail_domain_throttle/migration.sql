CREATE TABLE "recall"."MailDomainThrottle" (
  "senderDomain" TEXT NOT NULL,
  "nextAvailableAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MailDomainThrottle_pkey" PRIMARY KEY ("senderDomain")
);

CREATE INDEX "MailDomainThrottle_nextAvailableAt_idx"
ON "recall"."MailDomainThrottle"("nextAvailableAt");
