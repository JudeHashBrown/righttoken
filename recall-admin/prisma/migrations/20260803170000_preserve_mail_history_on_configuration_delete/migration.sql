ALTER TABLE "recall"."Mailbox"
  ALTER COLUMN "encryptedConfig" DROP NOT NULL,
  ADD COLUMN "configurationDeletedAt" TIMESTAMP(3);

CREATE INDEX "Mailbox_configurationDeletedAt_enabled_idx"
  ON "recall"."Mailbox"("configurationDeletedAt", "enabled");
