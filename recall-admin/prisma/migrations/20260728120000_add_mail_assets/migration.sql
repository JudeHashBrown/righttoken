CREATE TYPE "recall"."MailAssetDisposition"
  AS ENUM ('INLINE', 'ATTACHMENT');

ALTER TABLE "recall"."MailTemplate"
  ADD COLUMN "bodyHtml" TEXT;

ALTER TABLE "recall"."MailMessage"
  ADD COLUMN "bodyHtml" TEXT,
  ADD COLUMN "externalImagesBlocked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "recall"."MailAsset" (
  "id" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recall"."MailTemplateAsset" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "disposition" "recall"."MailAssetDisposition" NOT NULL,
  "cid" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailTemplateAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recall"."MailMessageAsset" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "disposition" "recall"."MailAssetDisposition" NOT NULL,
  "cid" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailMessageAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailAsset_storageKey_key"
  ON "recall"."MailAsset"("storageKey");
CREATE INDEX "MailAsset_createdById_createdAt_idx"
  ON "recall"."MailAsset"("createdById", "createdAt");

CREATE UNIQUE INDEX "MailTemplateAsset_templateId_assetId_disposition_key"
  ON "recall"."MailTemplateAsset"("templateId", "assetId", "disposition");
CREATE INDEX "MailTemplateAsset_assetId_idx"
  ON "recall"."MailTemplateAsset"("assetId");
CREATE INDEX "MailTemplateAsset_templateId_sortOrder_idx"
  ON "recall"."MailTemplateAsset"("templateId", "sortOrder");

CREATE UNIQUE INDEX "MailMessageAsset_messageId_assetId_disposition_key"
  ON "recall"."MailMessageAsset"("messageId", "assetId", "disposition");
CREATE INDEX "MailMessageAsset_assetId_idx"
  ON "recall"."MailMessageAsset"("assetId");
CREATE INDEX "MailMessageAsset_messageId_sortOrder_idx"
  ON "recall"."MailMessageAsset"("messageId", "sortOrder");

ALTER TABLE "recall"."MailTemplateAsset"
  ADD CONSTRAINT "MailTemplateAsset_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "recall"."MailTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recall"."MailTemplateAsset"
  ADD CONSTRAINT "MailTemplateAsset_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "recall"."MailAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recall"."MailMessageAsset"
  ADD CONSTRAINT "MailMessageAsset_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "recall"."MailMessage"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recall"."MailMessageAsset"
  ADD CONSTRAINT "MailMessageAsset_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "recall"."MailAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
