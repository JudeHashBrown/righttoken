CREATE TABLE "recall"."SiteVisit" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "visitDate" DATE NOT NULL,
  "visitorHash" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'ZZ',
  "region" TEXT,
  "path" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteVisit_eventId_key"
ON "recall"."SiteVisit"("eventId");

CREATE INDEX "SiteVisit_visitDate_visitorHash_idx"
ON "recall"."SiteVisit"("visitDate", "visitorHash");

CREATE INDEX "SiteVisit_visitDate_countryCode_idx"
ON "recall"."SiteVisit"("visitDate", "countryCode");

CREATE INDEX "SiteVisit_visitDate_countryCode_region_idx"
ON "recall"."SiteVisit"("visitDate", "countryCode", "region");
